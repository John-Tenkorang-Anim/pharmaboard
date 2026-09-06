// Package changelog implements the change-log append and safe-watermark
// barrier described in docs/technical-design.md section 10. A raw MAX
// (sequence_no) is not a safe sync cursor: PostgreSQL sequence allocation
// order is not commit order, so a client polling the bare max could skip a
// transaction that allocated an earlier sequence number but committed later.
//
// The fix is a short write barrier. Every writer that appends a change-log
// row holds a shared advisory lock for the lifetime of its transaction. The
// watermark publisher takes the corresponding exclusive advisory lock, which
// blocks until every in-flight writer has committed or rolled back, reads
// the true maximum committed sequence, records it as a watermark, and
// releases. Readers are only ever given a cursor at or below the latest
// recorded watermark, so they can never observe a gap left by a late commit.
package changelog

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// watermarkLockKey is an arbitrary, fixed advisory-lock identifier. It must
// never collide with another advisory lock namespace used by this service.
const watermarkLockKey int64 = 7_224_611_990_001

// Entry is one row of the append-only change log exposed to clients via the
// sync endpoint.
type Entry struct {
	SequenceNo    int64
	EntityType    string
	EntityID      uuid.UUID
	Operation     string
	EntityVersion int64
	AudienceKey   *string
}

// Append records one change inside the caller's transaction. It must be
// called from the same business transaction that made the change durable.
func Append(ctx context.Context, tx pgx.Tx, entityType string, entityID uuid.UUID, operation string, version int64, audienceKey *string) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock_shared($1)`, watermarkLockKey); err != nil {
		return fmt.Errorf("changelog: acquire writer barrier: %w", err)
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO change_log (entity_type, entity_id, operation, entity_version, audience_key)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (entity_type, entity_id, entity_version) DO NOTHING`,
		entityType, entityID, operation, version, audienceKey)
	if err != nil {
		return fmt.Errorf("changelog: append: %w", err)
	}
	return nil
}

// PublishWatermark waits for every in-flight writer to finish, then records
// the true maximum committed sequence number as a new safe watermark. It is
// intended to run on a short interval from the worker process, never inline
// with a request.
func PublishWatermark(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return 0, fmt.Errorf("changelog: acquire connection: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, watermarkLockKey); err != nil {
		return 0, fmt.Errorf("changelog: acquire publisher barrier: %w", err)
	}
	defer func() { _, _ = conn.Exec(ctx, `SELECT pg_advisory_unlock($1)`, watermarkLockKey) }()

	var maxSeq int64
	if err := conn.QueryRow(ctx, `SELECT COALESCE(MAX(sequence_no), 0) FROM change_log`).Scan(&maxSeq); err != nil {
		return 0, fmt.Errorf("changelog: read max sequence: %w", err)
	}

	if _, err := conn.Exec(ctx, `INSERT INTO sync_watermarks (safe_sequence) VALUES ($1)`, maxSeq); err != nil {
		return 0, fmt.Errorf("changelog: record watermark: %w", err)
	}

	return maxSeq, nil
}

// SafeWatermark returns the most recently published safe cursor. Sync reads
// must never be exposed past this value.
func SafeWatermark(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	var watermark int64
	err := pool.QueryRow(ctx, `SELECT COALESCE(MAX(safe_sequence), 0) FROM sync_watermarks`).Scan(&watermark)
	if err != nil {
		return 0, fmt.Errorf("changelog: read safe watermark: %w", err)
	}
	return watermark, nil
}

// Page returns up to limit entries after the given cursor, bounded by the
// latest safe watermark, plus the cursor a client should send next.
func Page(ctx context.Context, pool *pgxpool.Pool, after int64, limit int) ([]Entry, int64, error) {
	return page(ctx, pool, "", after, limit)
}

// PageByAudience is Page scoped to entries carrying a specific
// audience_key — e.g. a conversation ID, so a messaging module can paginate
// one conversation's messages using the exact same safe-watermark barrier
// that already protects notice sync, instead of a second bespoke cursor
// scheme with its own late-commit race to get right. Backed by
// change_log_audience_idx (audience_key, sequence_no), so this is an
// index-scoped query, not a scan of the whole change log.
func PageByAudience(ctx context.Context, pool *pgxpool.Pool, audienceKey string, after int64, limit int) ([]Entry, int64, error) {
	if audienceKey == "" {
		return nil, 0, fmt.Errorf("changelog: PageByAudience requires a non-empty audience key")
	}
	return page(ctx, pool, audienceKey, after, limit)
}

func page(ctx context.Context, pool *pgxpool.Pool, audienceKey string, after int64, limit int) ([]Entry, int64, error) {
	watermark, err := SafeWatermark(ctx, pool)
	if err != nil {
		return nil, 0, err
	}
	if after >= watermark {
		return []Entry{}, watermark, nil
	}

	query := `
		SELECT sequence_no, entity_type, entity_id, operation, entity_version, audience_key
		FROM change_log
		WHERE sequence_no > $1 AND sequence_no <= $2`
	args := []any{after, watermark}
	if audienceKey != "" {
		query += " AND audience_key = $3"
		args = append(args, audienceKey)
	}
	query += " ORDER BY sequence_no LIMIT " + fmt.Sprintf("$%d", len(args)+1)
	args = append(args, limit)

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("changelog: page: %w", err)
	}
	defer rows.Close()

	entries := []Entry{}
	next := after
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.SequenceNo, &e.EntityType, &e.EntityID, &e.Operation, &e.EntityVersion, &e.AudienceKey); err != nil {
			return nil, 0, fmt.Errorf("changelog: scan: %w", err)
		}
		entries = append(entries, e)
		next = e.SequenceNo
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("changelog: rows: %w", err)
	}

	return entries, next, nil
}
