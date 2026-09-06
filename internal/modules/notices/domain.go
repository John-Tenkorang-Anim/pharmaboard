// Package notices owns notice composition, approval, immutable targeting,
// delivery orchestration, acknowledgements, escalation, and delivery
// reports (docs/technical-design.md sections 3, 9, 18). It is the system's
// differentiator: a published notice's audience is frozen in one
// transaction and never silently edited.
package notices

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
)

type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityAdvisory Severity = "advisory"
	SeverityUrgent   Severity = "urgent"
	SeverityCritical Severity = "critical"
)

func (s Severity) Valid() bool {
	switch s {
	case SeverityInfo, SeverityAdvisory, SeverityUrgent, SeverityCritical:
		return true
	}
	return false
}

// RequiresSecondApprover matches docs/technical-design.md section 9: urgent
// and critical notices require an approver other than the author.
func (s Severity) RequiresSecondApprover() bool {
	return s == SeverityUrgent || s == SeverityCritical
}

type State string

const (
	StateDraft     State = "draft"
	StateInReview  State = "in_review"
	StateApproved  State = "approved"
	StatePublished State = "published"
	StateWithdrawn State = "withdrawn"
)

// transitions encodes the state machine from docs/technical-design.md
// section 9 exactly; any edge not listed here is rejected.
var transitions = map[State][]State{
	StateDraft:     {StateInReview},
	StateInReview:  {StateDraft, StateApproved},
	StateApproved:  {StatePublished},
	StatePublished: {StateWithdrawn},
	StateWithdrawn: {},
}

func (s State) CanTransitionTo(next State) bool {
	for _, allowed := range transitions[s] {
		if allowed == next {
			return true
		}
	}
	return false
}

type Notice struct {
	ID            uuid.UUID
	PublisherID   uuid.UUID
	Title         string
	BodyMarkdown  string
	Severity      Severity
	State         State
	AudienceRule  identity.AudienceRule
	AudienceSize  *int
	ApprovedBy    *uuid.UUID
	ApprovedAt    *time.Time
	PublishedAt   *time.Time
	WithdrawnAt   *time.Time
	SupersedesID  *uuid.UUID
	CreatedAt     time.Time
	Version       int64
}

type Recipient struct {
	NoticeID       uuid.UUID
	UserID         uuid.UUID
	DeliveredAt    *time.Time
	ReadAt         *time.Time
	AcknowledgedAt *time.Time
}

type DeliveryChannel string

const (
	ChannelPush  DeliveryChannel = "push"
	ChannelSMS   DeliveryChannel = "sms"
	ChannelEmail DeliveryChannel = "email"
	ChannelInApp DeliveryChannel = "in_app"
)

type AttemptState string

const (
	AttemptPending   AttemptState = "pending"
	AttemptClaimed   AttemptState = "claimed"
	AttemptAccepted  AttemptState = "accepted"
	AttemptDelivered AttemptState = "delivered"
	AttemptRetryable AttemptState = "retryable"
	AttemptFailed    AttemptState = "failed"
)

const MaxDeliveryAttempts = 5

// DeliveryReport gives a publisher a plain-language answer to "what
// happened" without engineering assistance (goal G6).
type DeliveryReport struct {
	NoticeID       uuid.UUID
	AudienceSize   int
	Delivered      int
	Read           int
	Acknowledged   int
	AttemptsFailed int
}

var (
	ErrNotFound            = errors.New("notices: not found")
	ErrInvalidState        = errors.New("notices: invalid state transition")
	ErrApproverIsAuthor    = errors.New("notices: approver must not be the author")
	ErrSecondApprovalRequired = errors.New("notices: urgent and critical notices require a distinct approver")
	ErrVersionConflict     = errors.New("notices: version conflict")
	ErrValidation          = errors.New("notices: validation failed")
)

func validateTitleAndBody(title, body string) error {
	if len(title) < 5 || len(title) > 200 {
		return fmt.Errorf("%w: title must be 5-200 characters", ErrValidation)
	}
	if len(body) == 0 {
		return fmt.Errorf("%w: body_markdown is required", ErrValidation)
	}
	return nil
}
