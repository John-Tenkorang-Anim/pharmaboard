// Package idempotency implements the Idempotency-Key contract required on
// externally initiated mutations (docs/technical-design.md section 15). The
// server stores a hash of the request and its eventual response; replaying
// the same key with the same body returns the stored response, and replaying
// it with a different body is rejected as a conflict.
package idempotency

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrKeyReused indicates the same Idempotency-Key was sent with a different
// request body. The caller must return 409 Conflict and must not repeat the
// underlying mutation.
var ErrKeyReused = errors.New("idempotency: key reused with a different request body")

// Stored is a previously recorded response for a given key.
type Stored struct {
	Status int
	Body   json.RawMessage
}

// HashBody produces the stable request hash stored alongside a key.
func HashBody(body []byte) [32]byte {
	return sha256.Sum256(body)
}

// Begin looks up a key within the caller's transaction. It returns
// (stored, true, nil) when the same operation already ran and the caller
// should replay the stored response without repeating side effects, or
// (nil, false, nil) when the caller should proceed and later call Store.
func Begin(ctx context.Context, tx pgx.Tx, userID string, key string, requestHash [32]byte) (*Stored, bool, error) {
	var existingHash []byte
	var status *int16
	var body json.RawMessage

	err := tx.QueryRow(ctx, `
		SELECT request_hash, response_status, response_body
		FROM idempotency_keys
		WHERE user_id = $1 AND key = $2
		FOR UPDATE`,
		userID, key,
	).Scan(&existingHash, &status, &body)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("idempotency: lookup: %w", err)
	}

	if string(existingHash) != string(requestHash[:]) {
		return nil, false, ErrKeyReused
	}
	if status == nil {
		// A prior attempt registered the key but never completed (crashed
		// mid-request). Let the caller retry the operation.
		return nil, false, nil
	}
	return &Stored{Status: int(*status), Body: body}, true, nil
}

// Reserve records that a key is in flight for this request hash, before the
// underlying mutation runs, so a concurrent duplicate request sees it.
func Reserve(ctx context.Context, tx pgx.Tx, userID string, key string, requestHash [32]byte, ttl time.Duration) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO idempotency_keys (key, user_id, request_hash, expires_at)
		VALUES ($1, $2, $3, now() + $4)
		ON CONFLICT (user_id, key) DO NOTHING`,
		key, userID, requestHash[:], ttl)
	if err != nil {
		return fmt.Errorf("idempotency: reserve: %w", err)
	}
	return nil
}

// Store records the final response for a key inside the caller's
// transaction, so the record commits atomically with the mutation it guards.
func Store(ctx context.Context, tx pgx.Tx, userID string, key string, status int, body any) error {
	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("idempotency: marshal response: %w", err)
	}
	_, err = tx.Exec(ctx, `
		UPDATE idempotency_keys
		SET response_status = $3, response_body = $4
		WHERE user_id = $1 AND key = $2`,
		userID, key, status, encoded)
	if err != nil {
		return fmt.Errorf("idempotency: store: %w", err)
	}
	return nil
}

// Purge deletes expired keys. Intended to run periodically from the worker.
func Purge(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	tag, err := pool.Exec(ctx, `DELETE FROM idempotency_keys WHERE expires_at < now()`)
	if err != nil {
		return 0, fmt.Errorf("idempotency: purge: %w", err)
	}
	return tag.RowsAffected(), nil
}
