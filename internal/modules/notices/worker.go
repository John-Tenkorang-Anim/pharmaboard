package notices

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/outbox"
)

const dispatchTopic = "notice.dispatch"

type dispatchPayload struct {
	NoticeID uuid.UUID `json:"notice_id"`
}

// Dispatcher runs the two loops described in docs/technical-design.md
// section 9: turning a published notice into per-recipient delivery
// attempts, and sending those attempts through a channel provider with
// classified retry. It is started from `pharmaboard worker`, never inline
// with an HTTP request, so publish latency stays independent of provider
// latency.
type Dispatcher struct {
	pool      *pgxpool.Pool
	repo      Repository
	providers map[DeliveryChannel]Provider
}

func NewDispatcher(pool *pgxpool.Pool, repo Repository, providers map[DeliveryChannel]Provider) *Dispatcher {
	return &Dispatcher{pool: pool, repo: repo, providers: providers}
}

// Run polls both loops until ctx is cancelled. Each tick is cheap and
// idempotent, so a crash between ticks loses no work: the outbox job and
// delivery_attempts leases simply expire and are reclaimed.
func (d *Dispatcher) Run(ctx context.Context, pollInterval time.Duration) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.runDispatchJobs(ctx)
			d.runAttemptSends(ctx)
		}
	}
}

func (d *Dispatcher) runDispatchJobs(ctx context.Context) {
	for {
		job, ok, err := outbox.Claim(ctx, d.pool, dispatchTopic, 30*time.Second)
		if err != nil {
			slog.Error("outbox claim failed", "error", err)
			return
		}
		if !ok {
			return
		}

		var payload dispatchPayload
		if err := json.Unmarshal(job.Payload, &payload); err != nil {
			slog.Error("dispatch payload decode failed", "job_id", job.ID, "error", err)
			// Not recoverable by retrying the same malformed payload.
			_ = outbox.Complete(ctx, d.pool, job.ID)
			continue
		}

		created, err := d.repo.CreateDeliveryAttempts(ctx, payload.NoticeID, ChannelPush)
		if err != nil {
			slog.Error("create delivery attempts failed", "notice_id", payload.NoticeID, "error", err)
			_ = outbox.Release(ctx, d.pool, job.ID)
			return
		}

		slog.Info("notice dispatch materialized", "notice_id", payload.NoticeID, "attempts_created", created)
		if err := outbox.Complete(ctx, d.pool, job.ID); err != nil {
			slog.Error("outbox complete failed", "job_id", job.ID, "error", err)
		}
	}
}

const attemptBatchSize = 50
const attemptLeaseSeconds = 30

func (d *Dispatcher) runAttemptSends(ctx context.Context) {
	attempts, err := d.repo.ClaimDeliveryAttempts(ctx, attemptBatchSize, attemptLeaseSeconds)
	if err != nil {
		slog.Error("claim delivery attempts failed", "error", err)
		return
	}

	for _, attempt := range attempts {
		provider, ok := d.providers[attempt.Channel]
		if !ok {
			slog.Error("no provider configured for channel", "channel", attempt.Channel)
			if err := d.repo.FailDeliveryAttempt(ctx, attempt.ID, "no_provider_configured"); err != nil {
				slog.Error("fail delivery attempt failed", "attempt_id", attempt.ID, "error", err)
			}
			continue
		}

		providerRef, sendErr := provider.Send(ctx, attempt)
		if sendErr == nil {
			if err := d.repo.CompleteDeliveryAttempt(ctx, attempt.ID, providerRef); err != nil {
				slog.Error("complete delivery attempt failed", "attempt_id", attempt.ID, "error", err)
			}
			continue
		}

		if errors.Is(sendErr, ErrProviderTransient) {
			if err := d.repo.RetryOrFailDeliveryAttempt(ctx, attempt.ID, "provider_transient"); err != nil {
				slog.Error("retry delivery attempt failed", "attempt_id", attempt.ID, "error", err)
			}
			continue
		}

		if err := d.repo.FailDeliveryAttempt(ctx, attempt.ID, "provider_permanent"); err != nil {
			slog.Error("fail delivery attempt failed", "attempt_id", attempt.ID, "error", err)
		}
	}
}
