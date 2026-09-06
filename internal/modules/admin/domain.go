// Package admin owns institutional publisher administration: least-
// privilege role grants and the read side of the append-only audit trail
// (docs/technical-design.md section 8). It never writes audit_events
// directly — internal/platform/audit does that inside each module's own
// business transaction — but it is the sanctioned place to query the trail
// for reporting.
package admin

import (
	"errors"

	"github.com/google/uuid"
)

type Role string

const (
	RoleAuthor         Role = "author"
	RoleApprover       Role = "approver"
	RolePublisherAdmin Role = "publisher_admin"
	RoleAuditor        Role = "auditor"
)

func (r Role) Valid() bool {
	switch r {
	case RoleAuthor, RoleApprover, RolePublisherAdmin, RoleAuditor:
		return true
	}
	return false
}

type AuditEvent struct {
	ID          int64
	ActorID     *uuid.UUID
	Action      string
	SubjectType string
	SubjectID   *uuid.UUID
	Metadata    map[string]any
	OccurredAt  string
}

var (
	ErrRoleExists = errors.New("admin: role already granted")
	ErrForbidden  = errors.New("admin: caller lacks the required role")
	ErrValidation = errors.New("admin: validation failed")
)
