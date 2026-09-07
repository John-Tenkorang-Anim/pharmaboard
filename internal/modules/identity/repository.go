package identity

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Repository is the persistence port for the identity module. The Postgres
// implementation lives in postgres.go; tests may supply a fake.
type Repository interface {
	CreateUser(ctx context.Context, u User) error
	FindByContact(ctx context.Context, channel Channel, value string) (User, error)
	FindByID(ctx context.Context, id uuid.UUID) (User, error)

	ReserveExternalOTP(ctx context.Context, id, userID uuid.UUID, channel Channel, codeHash []byte, expiresAt time.Time) error
	CreateOTPChallenge(ctx context.Context, id, userID uuid.UUID, channel Channel, codeHash []byte, expiresAt time.Time) error
	ConsumeOTPChallenge(ctx context.Context, userID uuid.UUID, channel Channel, codeHash []byte) (bool, error)
	IncrementOTPAttempts(ctx context.Context, userID uuid.UUID, channel Channel) (int16, error)

	CreateSession(ctx context.Context, id, userID uuid.UUID, tokenHash []byte, expiresAt time.Time) error
	FindSessionByTokenHash(ctx context.Context, tokenHash []byte) (uuid.UUID, error)
	RevokeSession(ctx context.Context, sessionID uuid.UUID) error

	// SetVerification applies a manual or authoritative verification
	// decision. It runs its own transaction that also appends the audit
	// event, matching the doc's requirement to record evidence source,
	// reviewer, time, and reason with the state change.
	SetVerification(ctx context.Context, userID uuid.UUID, state VerificationState, regNo *string, reviewerID uuid.UUID, evidenceSource, reason string) error

	// ResolveEligibleUserIDs evaluates rule against verified users within
	// the caller's transaction, so a notice publish and its audience freeze
	// commit atomically. This is the sanctioned cross-module read: notices
	// passes its transaction in; only identity ever queries the users table.
	ResolveEligibleUserIDs(ctx context.Context, tx pgx.Tx, rule AudienceRule) ([]uuid.UUID, error)

	// ProfilesByIDs batch-loads public profiles. Other modules (community,
	// messaging) use this to turn author/participant IDs into displayable
	// people in one round trip instead of N.
	ProfilesByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]Profile, error)

	// SearchDirectory backs "find a colleague". Bounded by the service.
	SearchDirectory(ctx context.Context, q DirectoryQuery) ([]Profile, error)
}
