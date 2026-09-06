// Package messaging owns direct and small-group conversations, messages,
// read receipts, and brokered third-party video call sessions. See
// docs/adr/0004-early-messaging-and-video.md for why this exists ahead of
// the original technical-design roadmap gate and the disclosure
// requirements that come with that decision — this package's job is to
// make those disclosures impossible to accidentally omit, not just to
// move bytes between users.
package messaging

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// EncryptionNotice is surfaced on every conversation response so no client
// can present messaging as more private than it is (ADR-0004, matching
// docs/technical-design.md section 12's ban on unreviewed security claims).
const EncryptionNotice = "Messages are protected in transit (TLS) but are not end-to-end encrypted. PharmaBoard infrastructure can access message content, the same as a notice or forum post."

// VideoProviderNotice is surfaced on every call-session response.
const VideoProviderNotice = "Video calls run on a public third-party server (Jitsi Meet), not PharmaBoard infrastructure. Anyone who obtains the room link can join; PharmaBoard does not control that provider's data handling."

const (
	MinParticipants  = 2
	MaxParticipants  = 20
	MaxMessageLength = 4000
	MaxTitleLength   = 120
)

type ConversationKind string

const (
	KindDirect ConversationKind = "direct"
	KindGroup  ConversationKind = "group"
)

type Conversation struct {
	ID            uuid.UUID
	Kind          ConversationKind
	Title         *string
	CreatedBy     uuid.UUID
	CreatedAt     time.Time
	LastMessageAt *time.Time
}

type Participant struct {
	ConversationID uuid.UUID
	UserID         uuid.UUID
	JoinedAt       time.Time
	LeftAt         *time.Time
}

func (p Participant) Active() bool { return p.LeftAt == nil }

type MessageKind string

const (
	MessageKindText   MessageKind = "text"
	MessageKindSystem MessageKind = "system"
)

type Message struct {
	ID             uuid.UUID
	ConversationID uuid.UUID
	SenderID       *uuid.UUID
	Kind           MessageKind
	Body           string
	CreatedAt      time.Time
	DeletedAt      *time.Time
}

const VideoProvider = "jitsi_public"

type CallSession struct {
	ID             uuid.UUID
	ConversationID uuid.UUID
	StartedBy      uuid.UUID
	Provider       string
	RoomSlug       string
	StartedAt      time.Time
	EndedAt        *time.Time
}

// RoomURL builds the joinable Jitsi Meet URL for a call session's slug.
// Kept as a method (not stored) so the base domain can move without a
// migration if the provider ever changes.
func (c CallSession) RoomURL() string {
	return "https://meet.jit.si/" + c.RoomSlug
}

var (
	ErrNotFound           = errors.New("messaging: not found")
	ErrNotParticipant     = errors.New("messaging: caller is not an active participant in this conversation")
	ErrValidation         = errors.New("messaging: validation failed")
	ErrGroupOnly          = errors.New("messaging: direct conversations have a fixed pair of participants")
	ErrAlreadyParticipant = errors.New("messaging: user is already a participant")
)
