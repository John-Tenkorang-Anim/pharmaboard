package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

var _ Repository = (*PostgresRepository)(nil)

func (r *PostgresRepository) GrantRole(ctx context.Context, userID uuid.UUID, role Role, grantedBy *uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO publisher_roles (user_id, role, granted_by) VALUES ($1, $2, $3)`,
		userID, string(role), grantedBy)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrRoleExists
		}
		return fmt.Errorf("admin: grant role: %w", err)
	}
	return nil
}

func (r *PostgresRepository) HasRole(ctx context.Context, userID uuid.UUID, role Role) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM publisher_roles WHERE user_id = $1 AND role = $2)`,
		userID, string(role),
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("admin: has role: %w", err)
	}
	return exists, nil
}

func (r *PostgresRepository) AnyPublisherAdminExists(ctx context.Context) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM publisher_roles WHERE role = 'publisher_admin')`,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("admin: check publisher admin exists: %w", err)
	}
	return exists, nil
}

func (r *PostgresRepository) ListAuditEvents(ctx context.Context, afterID int64, limit int) ([]AuditEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, actor_id, action, subject_type, subject_id, metadata, occurred_at
		FROM audit_events
		WHERE id > $1
		ORDER BY id
		LIMIT $2`,
		afterID, limit)
	if err != nil {
		return nil, fmt.Errorf("admin: list audit events: %w", err)
	}
	defer rows.Close()

	events := []AuditEvent{}
	for rows.Next() {
		var e AuditEvent
		var metadataBytes []byte
		if err := rows.Scan(&e.ID, &e.ActorID, &e.Action, &e.SubjectType, &e.SubjectID, &metadataBytes, &e.OccurredAt); err != nil {
			return nil, fmt.Errorf("admin: scan audit event: %w", err)
		}
		if err := json.Unmarshal(metadataBytes, &e.Metadata); err != nil {
			return nil, fmt.Errorf("admin: decode audit metadata: %w", err)
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
