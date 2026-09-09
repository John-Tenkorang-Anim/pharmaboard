package messaging

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"testing"
)

type mutualRepo struct {
	Repository
	allowed bool
	sent    bool
	members []Participant
}

func (r *mutualRepo) MutualFollow(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return r.allowed, nil
}
func (r *mutualRepo) IsActiveParticipant(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return true, nil
}
func (r *mutualRepo) ListActiveParticipants(context.Context, uuid.UUID) ([]Participant, error) {
	return r.members, nil
}
func (r *mutualRepo) SendMessage(context.Context, uuid.UUID, uuid.UUID, string) (Message, error) {
	r.sent = true
	return Message{}, nil
}
func TestMutualFollowRequiredForExistingChat(t *testing.T) {
	sender, recipient, chat := uuid.New(), uuid.New(), uuid.New()
	r := &mutualRepo{members: []Participant{{UserID: sender}, {UserID: recipient}}}
	s := NewService(r)
	if _, err := s.SendMessage(context.Background(), sender, chat, "hello"); !errors.Is(err, ErrMutualFollow) || r.sent {
		t.Fatal("non-mutual send allowed", err)
	}
	r.allowed = true
	if _, err := s.SendMessage(context.Background(), sender, chat, "hello"); err != nil || !r.sent {
		t.Fatal("mutual send blocked", err)
	}
	r.allowed = false
	r.sent = false
	if _, err := s.SendMessage(context.Background(), sender, chat, "again"); !errors.Is(err, ErrMutualFollow) || r.sent {
		t.Fatal("unfollow did not revoke sending", err)
	}
	if _, err := s.StartCall(context.Background(), sender, chat); !errors.Is(err, ErrMutualFollow) {
		t.Fatal("call bypass", err)
	}
	if _, err := s.CreateConversation(context.Background(), sender, []uuid.UUID{recipient}, nil); !errors.Is(err, ErrMutualFollow) {
		t.Fatal("new chat bypass", err)
	}
}
