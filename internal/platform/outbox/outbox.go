// Package outbox implements the durable transactional-outbox job queue
// described in docs/technical-design.md section 9. A business transaction
// enqueues a job as part of its own commit; a worker claims jobs later with
// FOR UPDATE SKIP LOCKED and an expiring lease so two workers never process
// the same job concurrently and a crashed worker's lease simply expires.
package outbox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrDuplicate indicates the idempotency key was already enqueued. Callers
// treat this as success: the durable side effect they wanted already exists.
var ErrDuplicate = errors.New("outbox: job already enqueued")

// Job is a claimed unit of work leased to exactly one worker.
type Job struct {
	ID             int64
	Topic          string
	Payload        json.RawMessage
	Attempts       int16
	IdempotencyKey string
}

// Enqueue inserts a job as part of the caller's transaction. It must be
// called from inside the business transaction that produced the durable
// state the job will act on (see notices.Repository.Publish).
func Enqueue(ctx context.Context, tx pgx.Tx, topic string, payload any, idempotencyKey string) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("outbox: marshal payload: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_jobs (topic, payload, idempotency_key)
		VALUES ($1, $2, $3)
		ON CONFLICT (idempotency_key) DO NOTHING`,
		topic, body, idempotencyKey)
	if err != nil {
		return fmt.Errorf("outbox: enqueue: %w", err)
	}
	return nil
}

// Claim leases up to one runnable job for the given topic. It returns
// (nil, false, nil) when no work is available. The caller must call
// Complete or Release exactly once for a claimed job.
func Claim(ctx context.Context, pool *pgxpool.Pool, topic string, lease time.Duration) (*Job, bool, error) {
	var job Job
	err := pool.QueryRow(ctx, `
		UPDATE outbox_jobs
		SET attempts = attempts + 1, claimed_until = now() + $2
		WHERE id = (
			SELECT id FROM outbox_jobs
			WHERE topic = $1
			  AND completed_at IS NULL
			  AND available_at <= now()
			  AND (claimed_until IS NULL OR claimed_until < now())
			ORDER BY available_at, id
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		RETURNING id, topic, payload, attempts, idempotency_key`,
		topic, lease,
	).Scan(&job.ID, &job.Topic, &job.Payload, &job.Attempts, &job.IdempotencyKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("outbox: claim: %w", err)
	}
	return &job, true, nil
}

// Complete marks a claimed job done so it is never claimed again.
func Complete(ctx context.Context, pool *pgxpool.Pool, jobID int64) error {
	_, err := pool.Exec(ctx, `UPDATE outbox_jobs SET completed_at = now() WHERE id = $1`, jobID)
	if err != nil {
		return fmt.Errorf("outbox: complete: %w", err)
	}
	return nil
}

// Release gives up a lease early (e.g. on a transient failure) so another
// worker can retry immediately instead of waiting for the lease to expire.
func Release(ctx context.Context, pool *pgxpool.Pool, jobID int64) error {
	_, err := pool.Exec(ctx, `UPDATE outbox_jobs SET claimed_until = NULL WHERE id = $1`, jobID)
	if err != nil {
		return fmt.Errorf("outbox: release: %w", err)
	}
	return nil
}
