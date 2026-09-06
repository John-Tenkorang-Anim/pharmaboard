package notices

import (
	"context"

	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
)

// Repository is the persistence port for the notices module.
type Repository interface {
	Create(ctx context.Context, n Notice) error
	Get(ctx context.Context, id uuid.UUID) (Notice, error)
	List(ctx context.Context, after uuid.UUID, limit int, publishedOnly bool) ([]Notice, error)

	// Submit moves a draft into review. expectedVersion enforces optimistic
	// concurrency (docs/technical-design.md section 10).
	Submit(ctx context.Context, id uuid.UUID, expectedVersion int64) error
	RequestChanges(ctx context.Context, id uuid.UUID, expectedVersion int64) error

	// Approve records the second approver. It fails with
	// ErrApproverIsAuthor if approverID equals the notice's publisher_id;
	// the database CHECK constraint enforces the same invariant as a
	// backstop.
	Approve(ctx context.Context, id, approverID uuid.UUID, expectedVersion int64) error

	// Publish runs the full publish transaction from
	// docs/technical-design.md section 9: lock and verify the notice,
	// resolve and freeze the audience via AudienceSource, record the
	// audience size, set published_at, enqueue the dispatch job, and
	// append the audit event, all in one commit.
	Publish(ctx context.Context, audience identity.AudienceSource, id uuid.UUID, expectedVersion int64, publisherID uuid.UUID) (Notice, error)

	Withdraw(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID, expectedVersion int64) error

	Acknowledge(ctx context.Context, noticeID, userID uuid.UUID) error
	MarkRead(ctx context.Context, noticeID, userID uuid.UUID) error

	DeliveryReport(ctx context.Context, noticeID uuid.UUID) (DeliveryReport, error)

	// CreateDeliveryAttempts inserts one pending attempt per recipient for
	// the given channel, skipping any recipient that already has an
	// attempt on that channel (idempotent under outbox job redelivery).
	CreateDeliveryAttempts(ctx context.Context, noticeID uuid.UUID, channel DeliveryChannel) (int, error)

	// ClaimDeliveryAttempts leases a batch of runnable attempts with
	// FOR UPDATE SKIP LOCKED so concurrent workers never double-send.
	ClaimDeliveryAttempts(ctx context.Context, limit int, lease int64) ([]DeliveryAttempt, error)
	CompleteDeliveryAttempt(ctx context.Context, attemptID uuid.UUID, providerRef string) error
	// RetryOrFailDeliveryAttempt handles a transient failure: it schedules
	// a backed-off retry unless the policy limit is exhausted, in which
	// case the attempt dead-letters.
	RetryOrFailDeliveryAttempt(ctx context.Context, attemptID uuid.UUID, errorCode string) error
	// FailDeliveryAttempt handles a classified-permanent failure: it
	// dead-letters the attempt immediately without scheduling a retry.
	FailDeliveryAttempt(ctx context.Context, attemptID uuid.UUID, errorCode string) error
}

type DeliveryAttempt struct {
	ID        uuid.UUID
	NoticeID  uuid.UUID
	UserID    uuid.UUID
	Channel   DeliveryChannel
	AttemptNo int16
}
