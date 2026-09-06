package admin

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

// Routes mounts the admin module's HTTP surface under an authenticated
// session. /bootstrap is the one exception carved out by Service.Bootstrap
// itself (a shared-secret check), not by skipping auth.
func Routes(svc *Service, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)

	r.Post("/bootstrap", bootstrapHandler(svc))
	r.Post("/roles", grantRoleHandler(svc))
	r.Post("/verifications", verifyHandler(svc))
	r.Post("/revocations", revokeHandler(svc))
	r.Get("/audit-events", auditEventsHandler(svc))
	return r
}

func bootstrapHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Token string `json:"token"`
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
		if err := svc.Bootstrap(r.Context(), user.ID, req.Token); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "publisher_admin granted"})
	}
}

func grantRoleHandler(svc *Service) http.HandlerFunc {
	type request struct {
		UserID uuid.UUID `json:"user_id"`
		Role   string    `json:"role"`
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
		if err := svc.GrantRole(r.Context(), caller.ID, req.UserID, Role(req.Role)); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "role granted"})
	}
}

func verifyHandler(svc *Service) http.HandlerFunc {
	type request struct {
		UserID         uuid.UUID `json:"user_id"`
		RegNo          string    `json:"registration_number"`
		EvidenceSource string    `json:"evidence_source"`
		Reason         string    `json:"reason"`
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
		if err := svc.Verify(r.Context(), caller.ID, req.UserID, req.RegNo, req.EvidenceSource, req.Reason); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "verified"})
	}
}

func revokeHandler(svc *Service) http.HandlerFunc {
	type request struct {
		UserID uuid.UUID `json:"user_id"`
		Reason string    `json:"reason"`
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
		if err := svc.Revoke(r.Context(), caller.ID, req.UserID, req.Reason); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
	}
}

func auditEventsHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "authentication required")
			return
		}
		var after int64
		if v := r.URL.Query().Get("after"); v != "" {
			parsed, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				problem.BadRequest(w, "invalid_cursor", "after must be an integer")
				return
			}
			after = parsed
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

		events, err := svc.ListAuditEvents(r.Context(), caller.ID, after, limit)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": events})
	}
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		problem.Forbidden(w, err.Error())
	case errors.Is(err, ErrRoleExists):
		problem.Conflict(w, "role_exists", err.Error())
	case errors.Is(err, ErrValidation):
		problem.BadRequest(w, "validation_failed", err.Error())
	default:
		problem.Internal(w, "an unexpected error occurred")
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
