package admin

import (
	"context"
	"crypto/subtle"
	"fmt"

	"github.com/google/uuid"
)

// Verifier is the identity capability admin needs to act on verification
// decisions. identity.Service satisfies it structurally; admin never
// queries the users table itself.
type Verifier interface {
	Verify(ctx context.Context, userID uuid.UUID, regNo string, reviewerID uuid.UUID, evidenceSource, reason string) error
	Revoke(ctx context.Context, userID uuid.UUID, reviewerID uuid.UUID, reason string) error
}

type Service struct {
	repo           Repository
	verifier       Verifier
	bootstrapToken string
}

func NewService(repo Repository, verifier Verifier, bootstrapToken string) *Service {
	return &Service{repo: repo, verifier: verifier, bootstrapToken: bootstrapToken}
}

// Bootstrap grants the first publisher_admin role using a shared secret
// instead of an existing admin's authorization. It refuses once any
// publisher_admin exists, closing the bootstrap window permanently.
func (s *Service) Bootstrap(ctx context.Context, userID uuid.UUID, providedToken string) error {
	if subtle.ConstantTimeCompare([]byte(providedToken), []byte(s.bootstrapToken)) != 1 || s.bootstrapToken == "" {
		return ErrForbidden
	}
	exists, err := s.repo.AnyPublisherAdminExists(ctx)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("%w: bootstrap window is closed", ErrForbidden)
	}
	return s.repo.GrantRole(ctx, userID, RolePublisherAdmin, nil)
}

// GrantRole requires the caller to already hold publisher_admin.
func (s *Service) GrantRole(ctx context.Context, callerID, targetUserID uuid.UUID, role Role) error {
	if !role.Valid() {
		return ErrValidation
	}
	ok, err := s.repo.HasRole(ctx, callerID, RolePublisherAdmin)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return s.repo.GrantRole(ctx, targetUserID, role, &callerID)
}

func (s *Service) HasRole(ctx context.Context, userID uuid.UUID, role Role) (bool, error) {
	return s.repo.HasRole(ctx, userID, role)
}

// Verify requires the caller to hold publisher_admin, matching the doc's
// requirement that verification decisions have a recorded reviewer with
// standing to make them.
func (s *Service) Verify(ctx context.Context, callerID, targetUserID uuid.UUID, regNo, evidenceSource, reason string) error {
	ok, err := s.repo.HasRole(ctx, callerID, RolePublisherAdmin)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return s.verifier.Verify(ctx, targetUserID, regNo, callerID, evidenceSource, reason)
}

func (s *Service) Revoke(ctx context.Context, callerID, targetUserID uuid.UUID, reason string) error {
	ok, err := s.repo.HasRole(ctx, callerID, RolePublisherAdmin)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return s.verifier.Revoke(ctx, targetUserID, callerID, reason)
}

func (s *Service) ListAuditEvents(ctx context.Context, callerID uuid.UUID, afterID int64, limit int) ([]AuditEvent, error) {
	isAdmin, err := s.repo.HasRole(ctx, callerID, RolePublisherAdmin)
	if err != nil {
		return nil, err
	}
	isAuditor, err := s.repo.HasRole(ctx, callerID, RoleAuditor)
	if err != nil {
		return nil, err
	}
	if !isAdmin && !isAuditor {
		return nil, ErrForbidden
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.repo.ListAuditEvents(ctx, afterID, limit)
}
