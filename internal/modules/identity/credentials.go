package identity

import (
	"context"
	"encoding/hex"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

type GoogleIdentity struct{ Subject, Email, Name string }
type GoogleVerifier interface {
	Verify(context.Context, string) (GoogleIdentity, error)
}
type googleVerifier struct{ verifier *oidc.IDTokenVerifier }

func (s *Service) ConfigureGoogle(clientID string) {
	if clientID == "" {
		return
	}
	keys := oidc.NewRemoteKeySet(context.Background(), "https://www.googleapis.com/oauth2/v3/certs")
	s.google = googleVerifier{oidc.NewVerifier("https://accounts.google.com", keys, &oidc.Config{ClientID: clientID})}
}
func (g googleVerifier) Verify(ctx context.Context, credential string) (GoogleIdentity, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	token, err := g.verifier.Verify(ctx, credential)
	if err != nil {
		return GoogleIdentity{}, ErrInvalidCredentials
	}
	var claims struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Verified bool   `json:"email_verified"`
	}
	if token.Claims(&claims) != nil || !claims.Verified || token.Subject == "" {
		return GoogleIdentity{}, ErrInvalidCredentials
	}
	return GoogleIdentity{token.Subject, claims.Email, claims.Name}, nil
}

type credentialRepository interface {
	CreateAccount(context.Context, User, string, string) error
	FindCredential(context.Context, string, string) (uuid.UUID, string, error)
	AllowLogin(context.Context, string) error
}

func normalizeEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || len(email) > 254 {
		return "", ErrInvalidCredentials
	}
	return email, nil
}
func (s *Service) credentialSession(ctx context.Context, id uuid.UUID) (Session, error) {
	if _, err := s.repo.FindByID(ctx, id); err != nil {
		return Session{}, ErrInvalidCredentials
	}
	token, err := newOpaqueToken()
	if err != nil {
		return Session{}, err
	}
	expires := time.Now().Add(sessionTTL)
	err = s.repo.CreateSession(ctx, uuid.Must(uuid.NewV7()), id, hashToken(token), expires)
	return Session{Token: token, UserID: id, ExpiresAt: expires}, err
}
func (s *Service) PasswordLogin(ctx context.Context, email, password string) (Session, error) {
	email, err := normalizeEmail(email)
	if err != nil || len(password) > 72 {
		return Session{}, ErrInvalidCredentials
	}
	repo := s.repo.(credentialRepository)
	if err = repo.AllowLogin(ctx, email); err != nil {
		return Session{}, err
	}
	id, hash, err := repo.FindCredential(ctx, email, "")
	if err != nil && !errors.Is(err, ErrNotFound) {
		return Session{}, err
	}
	if err != nil || hash == "" {
		bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(password))
		return Session{}, ErrInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return Session{}, ErrInvalidCredentials
	}
	return s.credentialSession(ctx, id)
}

var dummyPasswordHash, _ = bcrypt.GenerateFromPassword([]byte("timing-only-placeholder"), 12)

func (s *Service) CreateAccount(ctx context.Context, in RegisterInput, password, subject string) (Session, error) {
	if in.Email == nil {
		return Session{}, ErrInvalidCredentials
	}
	email, err := normalizeEmail(*in.Email)
	if err != nil {
		return Session{}, err
	}
	if !in.AccountKind.Valid() || len(strings.TrimSpace(in.DisplayName)) < 2 || len(in.DisplayName) > 120 || (in.Institution != nil && len(*in.Institution) > 160) || (in.PracticeArea != nil && len(*in.PracticeArea) > 160) {
		return Session{}, ErrInvalidCredentials
	}
	hash := ""
	if subject == "" {
		if len(password) < 12 || len(password) > 72 {
			return Session{}, ErrInvalidCredentials
		}
		if err = s.repo.(credentialRepository).AllowLogin(ctx, email); err != nil {
			return Session{}, err
		}
		encoded, e := bcrypt.GenerateFromPassword([]byte(password), 12)
		if e != nil {
			return Session{}, e
		}
		hash = string(encoded)
	}
	user := User{ID: uuid.Must(uuid.NewV7()), AccountKind: in.AccountKind, DisplayName: strings.TrimSpace(in.DisplayName), Email: &email, Institution: in.Institution, PracticeArea: in.PracticeArea, VerificationState: VerificationUnverified}
	if err = s.repo.(credentialRepository).CreateAccount(ctx, user, hash, subject); err != nil {
		return Session{}, err
	}
	return s.credentialSession(ctx, user.ID)
}
func (s *Service) GoogleLogin(ctx context.Context, credential string, in RegisterInput) (Session, error) {
	if s.google == nil {
		return Session{}, errors.New("Google sign-in is not configured")
	}
	identity, err := s.google.Verify(ctx, credential)
	if err != nil {
		return Session{}, ErrInvalidCredentials
	}
	id, _, err := s.repo.(credentialRepository).FindCredential(ctx, "", identity.Subject)
	if err == nil {
		return s.credentialSession(ctx, id)
	}
	if !errors.Is(err, ErrNotFound) {
		return Session{}, err
	}
	// Never link by matching email: legacy emails have not proved ownership.
	in.Email = &identity.Email
	if in.DisplayName == "" {
		in.DisplayName = identity.Name
	}
	if !in.AccountKind.Valid() {
		return Session{}, errGoogleSignup
	}
	return s.CreateAccount(ctx, in, "", identity.Subject)
}

var errGoogleSignup = errors.New("Complete your profile to create your Google account")

func (r *PostgresRepository) CreateAccount(ctx context.Context, u User, password, subject string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `INSERT INTO users(id,account_kind,display_name,email,institution,practice_area,verification_state) VALUES($1,$2,$3,$4,$5,$6,'unverified')`, u.ID, u.AccountKind, u.DisplayName, u.Email, u.Institution, u.PracticeArea)
	if isUniqueViolation(err) {
		return ErrAlreadyExists
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO account_credentials(user_id,password_hash,google_subject) VALUES($1,NULLIF($2,''),NULLIF($3,''))`, u.ID, password, subject)
	if isUniqueViolation(err) {
		return ErrAlreadyExists
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (r *PostgresRepository) FindCredential(ctx context.Context, email, subject string) (uuid.UUID, string, error) {
	var id uuid.UUID
	var hash string
	err := r.pool.QueryRow(ctx, `SELECT u.id,COALESCE(c.password_hash,'') FROM users u JOIN account_credentials c ON c.user_id=u.id WHERE u.deleted_at IS NULL AND (($1<>'' AND lower(trim(u.email))=$1) OR ($2<>'' AND c.google_subject=$2))`, email, subject).Scan(&id, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return id, hash, err
}
func (r *PostgresRepository) AllowLogin(ctx context.Context, email string) error {
	var attempts int
	// Shared between API instances; fixed 15-minute window, max 10 attempts.
	err := r.pool.QueryRow(ctx, `INSERT INTO login_attempts(contact_hash) VALUES($1) ON CONFLICT(contact_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start < now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END, window_start=CASE WHEN login_attempts.window_start < now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`, hex.EncodeToString(hashToken(email))).Scan(&attempts)
	if err != nil {
		return err
	}
	if attempts > 10 {
		return ErrTooManyAttempts
	}
	return nil
}
