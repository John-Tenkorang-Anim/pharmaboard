package sync

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
)

// Routes mounts GET /v1/sync as specified in docs/technical-design.md
// section 10: `GET /v1/sync?after=<safe_cursor>&limit=500`.
func Routes(svc *Service, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)
	r.Get("/", pageHandler(svc))
	return r
}

func pageHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		page, err := svc.Page(r.Context(), after, limit)
		if err != nil {
			problem.Internal(w, "an unexpected error occurred")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"entries":     page.Entries,
			"next_cursor": page.NextCursor,
		})
	}
}
