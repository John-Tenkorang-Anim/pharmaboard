package notices

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
)

// Routes mounts the notices module's HTTP surface. Every route requires an
// authenticated session; role checks beyond "is a recognized user" (e.g.
// "may approve") are deferred to the admin module's role grants and noted
// as a gap in CLAUDE.md.
func Routes(svc *Service, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)

	r.Post("/", createHandler(svc))
	r.Get("/", listHandler(svc))
	r.Route("/{id}", func(r chi.Router) {
		r.Get("/", getHandler(svc))
		r.Get("/report", reportHandler(svc))

		r.Post("/submit", transitionHandler(svc, func(ctx context.Context, s *Service, id uuid.UUID, v int64, _ identity.User) error {
			return s.Submit(ctx, id, v)
		}))
		r.Post("/request-changes", transitionHandler(svc, func(ctx context.Context, s *Service, id uuid.UUID, v int64, _ identity.User) error {
			return s.RequestChanges(ctx, id, v)
		}))
		r.Post("/approve", transitionHandler(svc, func(ctx context.Context, s *Service, id uuid.UUID, v int64, actor identity.User) error {
			return s.Approve(ctx, id, actor.ID, v)
		}))
		r.Post("/publish", publishHandler(svc))
		r.Post("/withdraw", withdrawHandler(svc))
		r.Post("/ack", ackHandler(svc))
		r.Post("/read", readHandler(svc))
	})
	return r
}

func createHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Title        string                `json:"title"`
		BodyMarkdown string                `json:"body_markdown"`
		Severity     string                `json:"severity"`
		AudienceRule identity.AudienceRule `json:"audience_rule"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}

		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}

		n, err := svc.CreateDraft(r.Context(), DraftInput{
			PublisherID:  user.ID,
			Title:        req.Title,
			BodyMarkdown: req.BodyMarkdown,
			Severity:     Severity(req.Severity),
			AudienceRule: req.AudienceRule,
		})
		if err != nil {
			writeServiceError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, noticeResponse(n))
	}
}

func listHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		after := uuid.Nil
		if v := r.URL.Query().Get("after"); v != "" {
			parsed, err := uuid.Parse(v)
			if err != nil {
				problem.BadRequest(w, "invalid_cursor", "after must be a UUID")
				return
			}
			after = parsed
		}
		limit := 50
		if v := r.URL.Query().Get("limit"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil {
				limit = parsed
			}
		}
		publishedOnly := r.URL.Query().Get("published_only") != "false"

		notices, err := svc.List(r.Context(), after, limit, publishedOnly)
		if err != nil {
			writeServiceError(w, err)
			return
		}

		items := make([]map[string]any, len(notices))
		var next *uuid.UUID
		for i, n := range notices {
			items[i] = noticeResponse(n)
			id := n.ID
			next = &id
		}
		body := map[string]any{"items": items}
		if next != nil {
			body["next_cursor"] = next
		}
		writeJSON(w, http.StatusOK, body)
	}
}

func getHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parseID(r)
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		n, err := svc.Get(r.Context(), id)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, noticeResponse(n))
	}
}

type versionedRequest struct {
	Version int64 `json:"version"`
}

func transitionHandler(svc *Service, fn func(context.Context, *Service, uuid.UUID, int64, identity.User) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r)
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		var req versionedRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		if err := fn(r.Context(), svc, id, req.Version, user); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func publishHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r)
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		var req versionedRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}

		n, err := svc.Publish(r.Context(), id, req.Version, user.ID)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, noticeResponse(n))
	}
}

func withdrawHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Version int64  `json:"version"`
		Reason  string `json:"reason"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r)
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		if err := svc.Withdraw(r.Context(), id, req.Reason, user.ID, req.Version); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "withdrawn"})
	}
}

func ackHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r)
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		if err := svc.Acknowledge(r.Context(), id, user.ID); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "acknowledged"})
	}
}

func readHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		id, err := parseID(r)
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		if err := svc.MarkRead(r.Context(), id, user.ID); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "read"})
	}
}

func reportHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := parseID(r)
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		report, err := svc.DeliveryReport(r.Context(), id)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, report)
	}
}

func parseID(r *http.Request) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, "id"))
}

func noticeResponse(n Notice) map[string]any {
	return map[string]any{
		"id":            n.ID,
		"publisher_id":  n.PublisherID,
		"title":         n.Title,
		"body_markdown": n.BodyMarkdown,
		"severity":      n.Severity,
		"state":         n.State,
		"audience_rule": n.AudienceRule,
		"audience_size": n.AudienceSize,
		"approved_by":   n.ApprovedBy,
		"published_at":  n.PublishedAt,
		"withdrawn_at":  n.WithdrawnAt,
		"created_at":    n.CreatedAt,
		"version":       n.Version,
	}
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		problem.NotFound(w, err.Error())
	case errors.Is(err, ErrValidation):
		problem.BadRequest(w, "validation_failed", err.Error())
	case errors.Is(err, ErrInvalidState):
		problem.Conflict(w, "invalid_state", err.Error())
	case errors.Is(err, ErrApproverIsAuthor):
		problem.Forbidden(w, err.Error())
	case errors.Is(err, ErrVersionConflict):
		problem.Conflict(w, "version_conflict", err.Error())
	default:
		problem.Internal(w, "an unexpected error occurred")
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
