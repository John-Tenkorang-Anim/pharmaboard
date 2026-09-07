package identity

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	otpTTL         = 5 * time.Minute
	otpMaxAttempts = 5
	sessionTTL     = 30 * 24 * time.Hour
)

// Service implements the identity module's application logic. It is the
// only thing other modules or HTTP handlers talk to; Repository stays
// unexported from module boundaries by convention (docs/architecture
// says modules depend on interfaces, not implementations).
type Service struct {
	repo Repository
	// devMode surfaces the generated OTP code directly in API responses
	// instead of sending it through a real SMS/email provider. Phone-first
	// OTP is a product hypothesis per docs/technical-design.md section 11;
	// this keeps the whole flow runnable and testable without a contracted
	// provider while making the simulation impossible to mistake for prod.
	devMode bool
}

func NewService(repo Repository, environment string) *Service {
	return &Service{repo: repo, devMode: environment != "production"}
}

var _ AudienceSource = (*Service)(nil)

// AudienceSource is the interface notices depends on to resolve a targeting
// rule into a frozen recipient list within notices' own publish transaction,
// without ever querying the users table itself.
type AudienceSource interface {
	ResolveEligibleUserIDs(ctx context.Context, tx pgx.Tx, rule AudienceRule) ([]uuid.UUID, error)
}

// ResolveEligibleUserIDs implements AudienceSource by delegating to the
// repository, which runs the query inside the caller-supplied transaction.
func (s *Service) ResolveEligibleUserIDs(ctx context.Context, tx pgx.Tx, rule AudienceRule) ([]uuid.UUID, error) {
	return s.repo.ResolveEligibleUserIDs(ctx, tx, rule)
}

// RegisterInput is the minimal profile required to create an account.
// Verification happens later; registration alone never yields a verified
// badge.
type RegisterInput struct {
	AccountKind  AccountKind
	DisplayName  string
	PhoneE164    *string
	Email        *string
	RegionCode   *string
	Institution  *string
	PracticeArea *string
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (User, error) {
	if (in.Institution != nil && len(*in.Institution) > 160) || (in.PracticeArea != nil && len(*in.PracticeArea) > 160) {
		return User{}, fmt.Errorf("%w: institution and field must be at most 160 characters", ErrInvalidCredentials)
	}
	if !in.AccountKind.Valid() {
		return User{}, fmt.Errorf("%w: invalid account_kind", ErrInvalidCredentials)
	}
	if len(in.DisplayName) < 2 || len(in.DisplayName) > 120 {
		return User{}, fmt.Errorf("%w: display_name must be 2-120 characters", ErrInvalidCredentials)
	}
	if in.PhoneE164 == nil && in.Email == nil {
		return User{}, fmt.Errorf("%w: phone or email is required", ErrInvalidCredentials)
	}

	user := User{
		ID:                uuid.Must(uuid.NewV7()),
		AccountKind:       in.AccountKind,
		DisplayName:       in.DisplayName,
		PhoneE164:         in.PhoneE164,
		Email:             in.Email,
		RegionCode:        in.RegionCode,
		PracticeArea:      in.PracticeArea,
		Institution:       in.Institution,
		VerificationState: VerificationUnverified,
	}
	if err := s.repo.CreateUser(ctx, user); err != nil {
		return User{}, err
	}
	return s.repo.FindByID(ctx, user.ID)
}

// RequestOTPResult carries the generated code only in non-production
// environments, standing in for an SMS/email provider that is not part of
// this MVP.
type RequestOTPResult struct {
	UserID      uuid.UUID
	ExpiresAt   time.Time
	DevOnlyCode string
}

func (s *Service) RequestOTP(ctx context.Context, channel Channel, contact string) (RequestOTPResult, error) {
	user, err := s.repo.FindByContact(ctx, channel, contact)
	if err != nil {
		return RequestOTPResult{}, err
	}

	code, codeHash, err := newOTPCode()
	if err != nil {
		return RequestOTPResult{}, err
	}
	expiresAt := time.Now().Add(otpTTL)
	challengeID := uuid.Must(uuid.NewV7())
	if err := s.repo.CreateOTPChallenge(ctx, challengeID, user.ID, channel, codeHash, expiresAt); err != nil {
		return RequestOTPResult{}, err
	}

	result := RequestOTPResult{UserID: user.ID, ExpiresAt: expiresAt}
	if s.devMode {
		result.DevOnlyCode = code
	}
	return result, nil
}

type Session struct {
	Token     string
	UserID    uuid.UUID
	ExpiresAt time.Time
}

func (s *Service) VerifyOTP(ctx context.Context, channel Channel, contact, code string) (Session, error) {
	user, err := s.repo.FindByContact(ctx, channel, contact)
	if err != nil {
		return Session{}, err
	}

	attempts, err := s.repo.IncrementOTPAttempts(ctx, user.ID, channel)
	if err != nil {
		return Session{}, err
	}
	if attempts > otpMaxAttempts {
		return Session{}, ErrTooManyAttempts
	}

	ok, err := s.repo.ConsumeOTPChallenge(ctx, user.ID, channel, hashToken(code))
	if err != nil {
		return Session{}, err
	}
	if !ok {
		return Session{}, ErrInvalidCredentials
	}

	token, err := newOpaqueToken()
	if err != nil {
		return Session{}, err
	}
	expiresAt := time.Now().Add(sessionTTL)
	sessionID := uuid.Must(uuid.NewV7())
	if err := s.repo.CreateSession(ctx, sessionID, user.ID, hashToken(token), expiresAt); err != nil {
		return Session{}, err
	}

	return Session{Token: token, UserID: user.ID, ExpiresAt: expiresAt}, nil
}

func (s *Service) Authenticate(ctx context.Context, bearerToken string) (User, error) {
	userID, err := s.repo.FindSessionByTokenHash(ctx, hashToken(bearerToken))
	if err != nil {
		return User{}, err
	}
	return s.repo.FindByID(ctx, userID)
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (User, error) {
	return s.repo.FindByID(ctx, id)
}

var _ ProfileSource = (*Service)(nil)

// ProfilesByIDs implements ProfileSource for other modules.
func (s *Service) ProfilesByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]Profile, error) {
	return s.repo.ProfilesByIDs(ctx, ids)
}

func (s *Service) GetProfile(ctx context.Context, id uuid.UUID) (Profile, error) {
	user, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return Profile{}, err
	}
	return ProfileOf(user), nil
}

// maxDirectoryPage caps directory pagination. Unbounded paging is the
// scraping vector named in docs/technical-design.md section 12, so the cap
// lives here in the service rather than being a caller's choice.
const maxDirectoryPage = 50

func (s *Service) SearchDirectory(ctx context.Context, q DirectoryQuery) ([]Profile, error) {
	if q.Limit <= 0 || q.Limit > maxDirectoryPage {
		q.Limit = 25
	}
	return s.repo.SearchDirectory(ctx, q)
}

// Verify records a manual (or, later, authoritative Council) verification
// decision. reviewerID is required: verification evidence is never anonymous.
func (s *Service) Verify(ctx context.Context, userID uuid.UUID, regNo string, reviewerID uuid.UUID, evidenceSource, reason string) error {
	if evidenceSource == "" || reason == "" {
		return errors.New("identity: evidence_source and reason are required")
	}
	var regNoPtr *string
	if regNo != "" {
		regNoPtr = &regNo
	}
	return s.repo.SetVerification(ctx, userID, VerificationVerified, regNoPtr, reviewerID, evidenceSource, reason)
}

// Revoke immediately removes a verification badge without deleting the
// user's community history (docs/technical-design.md section 11).
func (s *Service) Revoke(ctx context.Context, userID uuid.UUID, reviewerID uuid.UUID, reason string) error {
	if reason == "" {
		return errors.New("identity: reason is required")
	}
	return s.repo.SetVerification(ctx, userID, VerificationRevoked, nil, reviewerID, "manual_review", reason)
}
