package messaging

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// CreateConversation creates a direct (exactly 2 participants) or group (up
// to MaxParticipants) conversation. Kind is derived from the participant
// count, not requested directly, so a caller can't mislabel a two-person
// conversation as a "group" or vice versa.
func (s *Service) CreateConversation(ctx context.Context, creatorID uuid.UUID, otherParticipantIDs []uuid.UUID, title *string) (Conversation, error) {
	all := dedupeWithCreator(creatorID, otherParticipantIDs)
	if len(all) < MinParticipants {
		return Conversation{}, fmt.Errorf("%w: a conversation needs at least %d distinct participants", ErrValidation, MinParticipants)
	}
	if len(all) > MaxParticipants {
		return Conversation{}, fmt.Errorf("%w: a conversation may have at most %d participants", ErrValidation, MaxParticipants)
	}

	kind := KindDirect
	if len(all) > 2 {
		kind = KindGroup
	}
	if kind == KindGroup && (title == nil || len(*title) == 0) {
		return Conversation{}, fmt.Errorf("%w: a group conversation requires a title", ErrValidation)
	}
	if title != nil && len(*title) > MaxTitleLength {
		return Conversation{}, fmt.Errorf("%w: title must be at most %d characters", ErrValidation, MaxTitleLength)
	}
	if kind == KindDirect {
		// A direct conversation's title is cosmetic at best (usually the
		// other participant's name, rendered client-side) — don't store one.
		title = nil
	}

	conv := Conversation{
		ID:        uuid.Must(uuid.NewV7()),
		Kind:      kind,
		Title:     title,
		CreatedBy: creatorID,
	}
	if err := s.repo.CreateConversation(ctx, conv, all); err != nil {
		return Conversation{}, err
	}
	return s.repo.GetConversation(ctx, conv.ID)
}

func dedupeWithCreator(creatorID uuid.UUID, others []uuid.UUID) []uuid.UUID {
	seen := map[uuid.UUID]bool{creatorID: true}
	all := []uuid.UUID{creatorID}
	for _, id := range others {
		if !seen[id] {
			seen[id] = true
			all = append(all, id)
		}
	}
	return all
}

func (s *Service) requireActiveParticipant(ctx context.Context, conversationID, userID uuid.UUID) error {
	ok, err := s.repo.IsActiveParticipant(ctx, conversationID, userID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotParticipant
	}
	return nil
}

func (s *Service) GetConversation(ctx context.Context, callerID, conversationID uuid.UUID) (Conversation, error) {
	if err := s.requireActiveParticipant(ctx, conversationID, callerID); err != nil {
		return Conversation{}, err
	}
	return s.repo.GetConversation(ctx, conversationID)
}

func (s *Service) ListConversations(ctx context.Context, callerID, after uuid.UUID, limit int) ([]Conversation, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.repo.ListConversationsForUser(ctx, callerID, after, limit)
}

// AddParticipant only applies to group conversations: a direct
// conversation's pair is fixed for its lifetime (start a new group instead).
func (s *Service) AddParticipant(ctx context.Context, callerID, conversationID, newUserID uuid.UUID) error {
	if err := s.requireActiveParticipant(ctx, conversationID, callerID); err != nil {
		return err
	}
	conv, err := s.repo.GetConversation(ctx, conversationID)
	if err != nil {
		return err
	}
	if conv.Kind != KindGroup {
		return ErrGroupOnly
	}

	alreadyIn, err := s.repo.IsActiveParticipant(ctx, conversationID, newUserID)
	if err != nil {
		return err
	}
	if alreadyIn {
		return ErrAlreadyParticipant
	}

	count, err := s.repo.ParticipantCount(ctx, conversationID)
	if err != nil {
		return err
	}
	if count >= MaxParticipants {
		return fmt.Errorf("%w: a conversation may have at most %d participants", ErrValidation, MaxParticipants)
	}

	return s.repo.AddParticipant(ctx, conversationID, callerID, newUserID)
}

func (s *Service) Leave(ctx context.Context, conversationID, userID uuid.UUID) error {
	return s.repo.LeaveConversation(ctx, conversationID, userID)
}

func (s *Service) SendMessage(ctx context.Context, callerID, conversationID uuid.UUID, body string) (Message, error) {
	if len(body) == 0 || len(body) > MaxMessageLength {
		return Message{}, fmt.Errorf("%w: message body must be 1-%d characters", ErrValidation, MaxMessageLength)
	}
	if err := s.requireActiveParticipant(ctx, conversationID, callerID); err != nil {
		return Message{}, err
	}
	return s.repo.SendMessage(ctx, conversationID, callerID, body)
}

func (s *Service) ListMessages(ctx context.Context, callerID, conversationID uuid.UUID, after int64, limit int) ([]Message, int64, error) {
	if err := s.requireActiveParticipant(ctx, conversationID, callerID); err != nil {
		return nil, 0, err
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.repo.ListMessages(ctx, conversationID, after, limit)
}

func (s *Service) MarkReadThrough(ctx context.Context, callerID, conversationID, throughMessageID uuid.UUID) error {
	if err := s.requireActiveParticipant(ctx, conversationID, callerID); err != nil {
		return err
	}
	return s.repo.MarkReadThrough(ctx, conversationID, callerID, throughMessageID)
}

// StartCall brokers a third-party video room for the conversation and
// announces it inline as a system message, so joining a call is visible
// the same way any other conversation event is — see ADR-0004 for why this
// is a link to an external provider rather than in-house media relay.
func (s *Service) StartCall(ctx context.Context, callerID, conversationID uuid.UUID) (CallSession, error) {
	if err := s.requireActiveParticipant(ctx, conversationID, callerID); err != nil {
		return CallSession{}, err
	}
	call, err := s.repo.StartCall(ctx, conversationID, callerID)
	if err != nil {
		return CallSession{}, err
	}
	if _, err := s.repo.InsertSystemMessage(ctx, conversationID, "A video call was started."); err != nil {
		return CallSession{}, err
	}
	return call, nil
}

func (s *Service) EndCall(ctx context.Context, callerID, callID uuid.UUID) error {
	return s.repo.EndCall(ctx, callID, callerID)
}
