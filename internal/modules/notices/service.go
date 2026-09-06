package notices

import (
	"context"

	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
)

// Service implements the notices module's application logic on top of
// Repository. It is the seam where authorization and validation live,
// separate from the SQL that guarantees correctness.
type Service struct {
	repo     Repository
	audience identity.AudienceSource
}

func NewService(repo Repository, audience identity.AudienceSource) *Service {
	return &Service{repo: repo, audience: audience}
}

type DraftInput struct {
	PublisherID  uuid.UUID
	Title        string
	BodyMarkdown string
	Severity     Severity
	AudienceRule identity.AudienceRule
}

func (s *Service) CreateDraft(ctx context.Context, in DraftInput) (Notice, error) {
	if !in.Severity.Valid() {
		return Notice{}, ErrValidation
	}
	if err := validateTitleAndBody(in.Title, in.BodyMarkdown); err != nil {
		return Notice{}, err
	}
	if err := in.AudienceRule.Validate(); err != nil {
		return Notice{}, err
	}

	n := Notice{
		ID:           uuid.Must(uuid.NewV7()),
		PublisherID:  in.PublisherID,
		Title:        in.Title,
		BodyMarkdown: in.BodyMarkdown,
		Severity:     in.Severity,
		State:        StateDraft,
		AudienceRule: in.AudienceRule,
		Version:      1,
	}
	if err := s.repo.Create(ctx, n); err != nil {
		return Notice{}, err
	}
	return n, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (Notice, error) {
	return s.repo.Get(ctx, id)
}

func (s *Service) List(ctx context.Context, after uuid.UUID, limit int, publishedOnly bool) ([]Notice, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.repo.List(ctx, after, limit, publishedOnly)
}

func (s *Service) Submit(ctx context.Context, id uuid.UUID, expectedVersion int64) error {
	return s.repo.Submit(ctx, id, expectedVersion)
}

func (s *Service) RequestChanges(ctx context.Context, id uuid.UUID, expectedVersion int64) error {
	return s.repo.RequestChanges(ctx, id, expectedVersion)
}

func (s *Service) Approve(ctx context.Context, id, approverID uuid.UUID, expectedVersion int64) error {
	return s.repo.Approve(ctx, id, approverID, expectedVersion)
}

// Publish runs the transactional audience freeze and dispatch enqueue. See
// PostgresRepository.Publish for the full correctness argument.
func (s *Service) Publish(ctx context.Context, id uuid.UUID, expectedVersion int64, publisherID uuid.UUID) (Notice, error) {
	return s.repo.Publish(ctx, s.audience, id, expectedVersion, publisherID)
}

func (s *Service) Withdraw(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID, expectedVersion int64) error {
	if reason == "" {
		return ErrValidation
	}
	return s.repo.Withdraw(ctx, id, reason, actorID, expectedVersion)
}

func (s *Service) Acknowledge(ctx context.Context, noticeID, userID uuid.UUID) error {
	return s.repo.Acknowledge(ctx, noticeID, userID)
}

func (s *Service) MarkRead(ctx context.Context, noticeID, userID uuid.UUID) error {
	return s.repo.MarkRead(ctx, noticeID, userID)
}

func (s *Service) DeliveryReport(ctx context.Context, noticeID uuid.UUID) (DeliveryReport, error) {
	return s.repo.DeliveryReport(ctx, noticeID)
}
