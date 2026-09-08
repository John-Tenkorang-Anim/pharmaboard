package messaging

import (
	"context"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"github.com/google/uuid"
	"net/http"
)

type UnreadConversation struct {
	Title          string    `json:"title"`
	ConversationID uuid.UUID `json:"conversation_id"`
	Count          int64     `json:"count"`
}
type UnreadSummary struct {
	Count            int64                `json:"count"`
	Items            []UnreadConversation `json:"items"`
	EncryptionNotice string               `json:"encryption_notice"`
}

func (r *PostgresRepository) Unread(ctx context.Context, userID uuid.UUID) (UnreadSummary, error) {
	result := UnreadSummary{Items: []UnreadConversation{}, EncryptionNotice: EncryptionNotice}
	rows, err := r.pool.Query(ctx, `SELECT m.conversation_id,count(*),sum(count(*)) OVER() FROM message_receipts r JOIN messages m ON m.id=r.message_id JOIN conversation_participants p ON p.conversation_id=m.conversation_id AND p.user_id=r.user_id WHERE r.user_id=$1 AND r.read_at IS NULL AND p.left_at IS NULL AND m.deleted_at IS NULL AND m.kind='text' AND m.sender_id<>$1 GROUP BY m.conversation_id ORDER BY max(m.created_at) DESC LIMIT 3`, userID)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item UnreadConversation
		if err := rows.Scan(&item.ConversationID, &item.Count, &result.Count); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}
func unreadHandler(s *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		result, err := s.repo.Unread(r.Context(), user.ID)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		for i := range result.Items {
			c, err := s.GetConversation(r.Context(), user.ID, result.Items[i].ConversationID)
			if err != nil {
				writeServiceError(w, err)
				return
			}
			title := "Conversation"
			if c.Title != nil {
				title = *c.Title
			} else {
				for _, m := range c.Members {
					if m.ID != user.ID {
						title = m.Name
						break
					}
				}
			}
			result.Items[i].Title = title
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, result)
	}
}
