package admin

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	GrantRole(ctx context.Context, userID uuid.UUID, role Role, grantedBy *uuid.UUID) error
	HasRole(ctx context.Context, userID uuid.UUID, role Role) (bool, error)
	AnyPublisherAdminExists(ctx context.Context) (bool, error)
	ListAuditEvents(ctx context.Context, afterID int64, limit int) ([]AuditEvent, error)
}
