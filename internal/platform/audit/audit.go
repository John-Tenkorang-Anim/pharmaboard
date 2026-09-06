// Package audit appends to the immutable administrative audit trail
// (docs/technical-design.md section 12, "insider audit tampering"). The
// audit_events table is enforced append-only by a database trigger; this
// package is the only writer path any module should use.
package audit

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Record appends one audit event inside the caller's transaction so the
// audit trail commits atomically with the business change it describes.
func Record(ctx context.Context, tx pgx.Tx, actorID *uuid.UUID, action, subjectType string, subjectID *uuid.UUID, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO audit_events (actor_id, action, subject_type, subject_id, metadata)
		VALUES ($1, $2, $3, $4, $5)`,
		actorID, action, subjectType, subjectID, metadata)
	if err != nil {
		return fmt.Errorf("audit: record %s: %w", action, err)
	}
	return nil
}
