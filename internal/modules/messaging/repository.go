package messaging

import (
	"context"

	"github.com/google/uuid"
)

// Repository is the persistence port for the messaging module.
type Repository interface {
	// CreateConversation inserts the conversation and all of
	// participantIDs (including the creator) in one transaction.
	CreateConversation(ctx context.Context, conv Conversation, participantIDs []uuid.UUID) error
	GetConversation(ctx context.Context, id uuid.UUID) (Conversation, error)
	ListConversationsForUser(ctx context.Context, userID uuid.UUID, after uuid.UUID, limit int) ([]Conversation, error)
	ListActiveParticipants(ctx context.Context, conversationID uuid.UUID) ([]Participant, error)
	IsActiveParticipant(ctx context.Context, conversationID, userID uuid.UUID) (bool, error)
	ParticipantCount(ctx context.Context, conversationID uuid.UUID) (int, error)

	AddParticipant(ctx context.Context, conversationID, actorID, newUserID uuid.UUID) error
	LeaveConversation(ctx context.Context, conversationID, userID uuid.UUID) error

	// SendMessage inserts the message, a pending receipt row for every
	// other active participant, and the change-log entry that makes it
	// visible via ListMessages, all in one transaction.
	SendMessage(ctx context.Context, conversationID uuid.UUID, senderID uuid.UUID, body string) (Message, error)
	// InsertSystemMessage is the same durability guarantee as SendMessage
	// for internally generated events (e.g. "X started a video call").
	InsertSystemMessage(ctx context.Context, conversationID uuid.UUID, body string) (Message, error)

	// ListMessages returns messages visible under the safe watermark,
	// scoped to this conversation via changelog.PageByAudience.
	ListMessages(ctx context.Context, conversationID uuid.UUID, after int64, limit int) ([]Message, int64, error)

	// MarkReadThrough sets delivered_at/read_at for every message in the
	// conversation up to and including throughMessageID for userID. UUIDv7
	// ordering means "id <=" is also chronological order.
	MarkReadThrough(ctx context.Context, conversationID, userID, throughMessageID uuid.UUID) error

	StartCall(ctx context.Context, conversationID, actorID uuid.UUID) (CallSession, error)
	EndCall(ctx context.Context, callID, actorID uuid.UUID) error
}
