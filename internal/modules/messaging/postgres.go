package messaging

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/changelog"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

var _ Repository = (*PostgresRepository)(nil)

func (r *PostgresRepository) CreateConversation(ctx context.Context, conv Conversation, participantIDs []uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("messaging: begin create conversation: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO conversations (id, kind, title, created_by)
		VALUES ($1, $2, $3, $4)`,
		conv.ID, string(conv.Kind), conv.Title, conv.CreatedBy,
	); err != nil {
		return fmt.Errorf("messaging: create conversation: %w", err)
	}

	ids := make([]string, len(participantIDs))
	for i, id := range participantIDs {
		ids[i] = id.String()
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, added_by)
		SELECT $1, x::uuid, CASE WHEN x::uuid = $2 THEN NULL ELSE $2 END
		FROM unnest($3::text[]) AS x`,
		conv.ID, conv.CreatedBy, ids,
	); err != nil {
		return fmt.Errorf("messaging: add participants: %w", err)
	}

	return tx.Commit(ctx)
}

const conversationColumns = `id, kind, title, created_by, created_at, last_message_at`

func scanConversation(row pgx.Row) (Conversation, error) {
	var c Conversation
	err := row.Scan(&c.ID, &c.Kind, &c.Title, &c.CreatedBy, &c.CreatedAt, &c.LastMessageAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, ErrNotFound
	}
	if err != nil {
		return Conversation{}, fmt.Errorf("messaging: scan conversation: %w", err)
	}
	return c, nil
}

func (r *PostgresRepository) GetConversation(ctx context.Context, id uuid.UUID) (Conversation, error) {
	row := r.pool.QueryRow(ctx, "SELECT "+conversationColumns+" FROM conversations WHERE id = $1", id)
	return scanConversation(row)
}

func (r *PostgresRepository) ListConversationsForUser(ctx context.Context, userID uuid.UUID, after uuid.UUID, limit int) ([]Conversation, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.kind, c.title, c.created_by, c.created_at, c.last_message_at
		FROM conversations c
		JOIN conversation_participants cp ON cp.conversation_id = c.id
		WHERE cp.user_id = $1 AND cp.left_at IS NULL AND c.id > $2
		ORDER BY c.id
		LIMIT $3`,
		userID, after, limit)
	if err != nil {
		return nil, fmt.Errorf("messaging: list conversations: %w", err)
	}
	defer rows.Close()

	conversations := []Conversation{}
	for rows.Next() {
		c, err := scanConversation(rows)
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, c)
	}
	return conversations, rows.Err()
}

func (r *PostgresRepository) ListActiveParticipants(ctx context.Context, conversationID uuid.UUID) ([]Participant, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT conversation_id, user_id, joined_at, left_at
		FROM conversation_participants
		WHERE conversation_id = $1 AND left_at IS NULL`,
		conversationID)
	if err != nil {
		return nil, fmt.Errorf("messaging: list participants: %w", err)
	}
	defer rows.Close()

	participants := []Participant{}
	for rows.Next() {
		var p Participant
		if err := rows.Scan(&p.ConversationID, &p.UserID, &p.JoinedAt, &p.LeftAt); err != nil {
			return nil, fmt.Errorf("messaging: scan participant: %w", err)
		}
		participants = append(participants, p)
	}
	return participants, rows.Err()
}

func (r *PostgresRepository) IsActiveParticipant(ctx context.Context, conversationID, userID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL
		)`, conversationID, userID,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("messaging: is active participant: %w", err)
	}
	return exists, nil
}

func (r *PostgresRepository) ParticipantCount(ctx context.Context, conversationID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM conversation_participants
		WHERE conversation_id = $1 AND left_at IS NULL`, conversationID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("messaging: participant count: %w", err)
	}
	return count, nil
}

func (r *PostgresRepository) AddParticipant(ctx context.Context, conversationID, actorID, newUserID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, added_by)
		VALUES ($1, $2, $3)
		ON CONFLICT (conversation_id, user_id) DO UPDATE
			SET left_at = NULL, added_by = EXCLUDED.added_by, joined_at = now()
			WHERE conversation_participants.left_at IS NOT NULL`,
		conversationID, newUserID, actorID)
	if err != nil {
		return fmt.Errorf("messaging: add participant: %w", err)
	}
	return nil
}

func (r *PostgresRepository) LeaveConversation(ctx context.Context, conversationID, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE conversation_participants SET left_at = now()
		WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
		conversationID, userID)
	if err != nil {
		return fmt.Errorf("messaging: leave conversation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotParticipant
	}
	return nil
}

func (r *PostgresRepository) SendMessage(ctx context.Context, conversationID uuid.UUID, senderID uuid.UUID, body string) (Message, error) {
	return r.insertMessage(ctx, conversationID, &senderID, MessageKindText, body)
}

func (r *PostgresRepository) InsertSystemMessage(ctx context.Context, conversationID uuid.UUID, body string) (Message, error) {
	return r.insertMessage(ctx, conversationID, nil, MessageKindSystem, body)
}

func (r *PostgresRepository) insertMessage(ctx context.Context, conversationID uuid.UUID, senderID *uuid.UUID, kind MessageKind, body string) (Message, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Message{}, fmt.Errorf("messaging: begin send message: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	msg := Message{
		ID:             uuid.Must(uuid.NewV7()),
		ConversationID: conversationID,
		SenderID:       senderID,
		Kind:           kind,
		Body:           body,
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, kind, body)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at`,
		msg.ID, msg.ConversationID, msg.SenderID, string(msg.Kind), msg.Body,
	).Scan(&msg.CreatedAt); err != nil {
		return Message{}, fmt.Errorf("messaging: insert message: %w", err)
	}

	// Pending receipts for every other active participant. A system
	// message (no sender) gets a receipt for every active participant.
	excludeSender := uuid.Nil
	if senderID != nil {
		excludeSender = *senderID
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO message_receipts (message_id, user_id)
		SELECT $1, user_id FROM conversation_participants
		WHERE conversation_id = $2 AND left_at IS NULL AND user_id <> $3`,
		msg.ID, conversationID, excludeSender,
	); err != nil {
		return Message{}, fmt.Errorf("messaging: insert receipts: %w", err)
	}

	if _, err := tx.Exec(ctx, `UPDATE conversations SET last_message_at = $2 WHERE id = $1`, conversationID, msg.CreatedAt); err != nil {
		return Message{}, fmt.Errorf("messaging: update last_message_at: %w", err)
	}

	audienceKey := conversationID.String()
	if err := changelog.Append(ctx, tx, "message", msg.ID, "upsert", 1, &audienceKey); err != nil {
		return Message{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Message{}, fmt.Errorf("messaging: commit send message: %w", err)
	}
	return msg, nil
}

func (r *PostgresRepository) ListMessages(ctx context.Context, conversationID uuid.UUID, after int64, limit int) ([]Message, int64, error) {
	entries, next, err := changelog.PageByAudience(ctx, r.pool, conversationID.String(), after, limit)
	if err != nil {
		return nil, 0, err
	}

	order := make(map[uuid.UUID]int, len(entries))
	ids := make([]string, 0, len(entries))
	for i, e := range entries {
		if e.EntityType != "message" {
			continue
		}
		order[e.EntityID] = i
		ids = append(ids, e.EntityID.String())
	}
	if len(ids) == 0 {
		return []Message{}, next, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, conversation_id, sender_id, kind, body, created_at, deleted_at
		FROM messages WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, 0, fmt.Errorf("messaging: list messages: %w", err)
	}
	defer rows.Close()

	messages := make([]Message, 0, len(ids))
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Kind, &m.Body, &m.CreatedAt, &m.DeletedAt); err != nil {
			return nil, 0, fmt.Errorf("messaging: scan message: %w", err)
		}
		messages = append(messages, m)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("messaging: rows: %w", err)
	}

	sort.Slice(messages, func(i, j int) bool { return order[messages[i].ID] < order[messages[j].ID] })
	return messages, next, nil
}

func (r *PostgresRepository) MarkReadThrough(ctx context.Context, conversationID, userID, throughMessageID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE message_receipts
		SET delivered_at = COALESCE(delivered_at, now()), read_at = COALESCE(read_at, now())
		WHERE user_id = $1
		  AND message_id IN (SELECT id FROM messages WHERE conversation_id = $2 AND id <= $3)`,
		userID, conversationID, throughMessageID)
	if err != nil {
		return fmt.Errorf("messaging: mark read through: %w", err)
	}
	return nil
}

func (r *PostgresRepository) StartCall(ctx context.Context, conversationID, actorID uuid.UUID) (CallSession, error) {
	slug, err := randomRoomSlug()
	if err != nil {
		return CallSession{}, err
	}

	call := CallSession{
		ID:             uuid.Must(uuid.NewV7()),
		ConversationID: conversationID,
		StartedBy:      actorID,
		Provider:       VideoProvider,
		RoomSlug:       slug,
	}
	if err := r.pool.QueryRow(ctx, `
		INSERT INTO call_sessions (id, conversation_id, started_by, provider, room_slug)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING started_at`,
		call.ID, call.ConversationID, call.StartedBy, call.Provider, call.RoomSlug,
	).Scan(&call.StartedAt); err != nil {
		return CallSession{}, fmt.Errorf("messaging: start call: %w", err)
	}
	return call, nil
}

func (r *PostgresRepository) EndCall(ctx context.Context, callID, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE call_sessions cs
		SET ended_at = now()
		WHERE cs.id = $1 AND cs.ended_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM conversation_participants cp
			WHERE cp.conversation_id = cs.conversation_id AND cp.user_id = $2 AND cp.left_at IS NULL
		  )`,
		callID, actorID)
	if err != nil {
		return fmt.Errorf("messaging: end call: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotParticipant
	}
	return nil
}

func randomRoomSlug() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("messaging: generate room slug: %w", err)
	}
	return "pharmaboard-" + hex.EncodeToString(buf), nil
}
