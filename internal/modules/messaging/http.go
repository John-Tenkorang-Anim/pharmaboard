package messaging

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
)

// Routes mounts the messaging module's HTTP surface under an authenticated
// session. See docs/adr/0004-early-messaging-and-video.md — every response
// that touches conversations or calls carries an explicit disclosure field
// (EncryptionNotice / VideoProviderNotice); do not add a response shape
// that omits it.
func Routes(svc *Service, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)
	r.Get("/unread", unreadHandler(svc))

	r.Route("/conversations", func(r chi.Router) {
		r.Post("/", createConversationHandler(svc))
		r.Get("/", listConversationsHandler(svc))
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", getConversationHandler(svc))
			r.Post("/participants", addParticipantHandler(svc))
			r.Post("/leave", leaveHandler(svc))
			r.Get("/messages", listMessagesHandler(svc))
			r.Post("/messages", sendMessageHandler(svc))
			r.Post("/read", markReadHandler(svc))
			r.Post("/calls", startCallHandler(svc))
		})
	})
	r.Post("/calls/{callID}/end", endCallHandler(svc))

	return r
}

func createConversationHandler(svc *Service) http.HandlerFunc {
	type request struct {
		ParticipantIDs []uuid.UUID `json:"participant_ids"`
		Title          *string     `json:"title"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		conv, err := svc.CreateConversation(r.Context(), caller.ID, req.ParticipantIDs, req.Title)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, conversationResponse(conv))
	}
}

func listConversationsHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		after := uuid.Nil
		if v := r.URL.Query().Get("after"); v != "" {
			parsed, err := uuid.Parse(v)
			if err != nil {
				problem.BadRequest(w, "invalid_cursor", "after must be a UUID")
				return
			}
			after = parsed
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

		conversations, err := svc.ListConversations(r.Context(), caller.ID, after, limit)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		items := make([]map[string]any, len(conversations))
		var next *uuid.UUID
		for i, c := range conversations {
			items[i] = conversationResponse(c)
			id := c.ID
			next = &id
		}
		body := map[string]any{"items": items}
		if next != nil {
			body["next_cursor"] = next
		}
		writeJSON(w, http.StatusOK, body)
	}
}

func getConversationHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r, "id")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		conv, err := svc.GetConversation(r.Context(), caller.ID, id)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, conversationResponse(conv))
	}
}

func addParticipantHandler(svc *Service) http.HandlerFunc {
	type request struct {
		UserID uuid.UUID `json:"user_id"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r, "id")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		if err := svc.AddParticipant(r.Context(), caller.ID, id, req.UserID); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "added"})
	}
}

func leaveHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r, "id")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		if err := svc.Leave(r.Context(), id, caller.ID); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "left"})
	}
}

func sendMessageHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Body string `json:"body"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r, "id")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		msg, err := svc.SendMessage(r.Context(), caller.ID, id, req.Body)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, messageResponse(msg))
	}
}

func listMessagesHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r, "id")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		var after int64
		if v := r.URL.Query().Get("after"); v != "" {
			parsed, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				problem.BadRequest(w, "invalid_cursor", "after must be an integer sequence number")
				return
			}
			after = parsed
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

		messages, next, err := svc.ListMessages(r.Context(), caller.ID, id, after, limit)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		items := make([]map[string]any, len(messages))
		for i, m := range messages {
			items[i] = messageResponse(m)
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items, "next_cursor": next})
	}
}

func markReadHandler(svc *Service) http.HandlerFunc {
	type request struct {
		ThroughMessageID uuid.UUID `json:"through_message_id"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r, "id")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		if err := svc.MarkReadThrough(r.Context(), caller.ID, id, req.ThroughMessageID); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "read"})
	}
}

func startCallHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r, "id")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		call, err := svc.StartCall(r.Context(), caller.ID, id)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, callResponse(call))
	}
}

func endCallHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		callID, err := parseID(r, "callID")
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		if err := svc.EndCall(r.Context(), caller.ID, callID); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ended"})
	}
}

func parseID(r *http.Request, param string) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, param))
}

func conversationResponse(c Conversation) map[string]any {
	return map[string]any{
		"id":                c.ID,
		"kind":              c.Kind,
		"members":           c.Members,
		"title":             c.Title,
		"created_by":        c.CreatedBy,
		"created_at":        c.CreatedAt,
		"last_message_at":   c.LastMessageAt,
		"encryption_notice": EncryptionNotice,
	}
}

func messageResponse(m Message) map[string]any {
	return map[string]any{
		"id":              m.ID,
		"conversation_id": m.ConversationID,
		"sender_id":       m.SenderID,
		"kind":            m.Kind,
		"body":            m.Body,
		"created_at":      m.CreatedAt,
	}
}

func callResponse(c CallSession) map[string]any {
	return map[string]any{
		"id":              c.ID,
		"conversation_id": c.ConversationID,
		"started_by":      c.StartedBy,
		"provider":        c.Provider,
		"room_url":        c.RoomURL(),
		"started_at":      c.StartedAt,
		"provider_notice": VideoProviderNotice,
	}
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		problem.NotFound(w, err.Error())
	case errors.Is(err, ErrNotParticipant):
		problem.Forbidden(w, err.Error())
	case errors.Is(err, ErrValidation):
		problem.BadRequest(w, "validation_failed", err.Error())
	case errors.Is(err, ErrGroupOnly):
		problem.Conflict(w, "group_only", err.Error())
	case errors.Is(err, ErrAlreadyParticipant):
		problem.Conflict(w, "already_participant", err.Error())
	default:
		problem.Internal(w, "an unexpected error occurred")
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
