package library

import (
	"encoding/json"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type item struct {
	ID        uuid.UUID `json:"id"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	Kind      string    `json:"kind"`
	Notes     string    `json:"notes"`
	Completed bool      `json:"completed"`
	CreatedAt time.Time `json:"created_at"`
}

func Routes(pool *pgxpool.Pool, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		u, _ := identity.UserFromContext(r.Context())
		rows, err := pool.Query(r.Context(), `SELECT id,title,url,kind,notes,completed,created_at FROM library_items WHERE owner_id=$1 ORDER BY created_at DESC`, u.ID)
		if err != nil {
			problem.Internal(w, "Library unavailable")
			return
		}
		defer rows.Close()
		items := []item{}
		for rows.Next() {
			var v item
			if rows.Scan(&v.ID, &v.Title, &v.URL, &v.Kind, &v.Notes, &v.Completed, &v.CreatedAt) != nil {
				problem.Internal(w, "Library unavailable")
				return
			}
			items = append(items, v)
		}
		if rows.Err() != nil {
			problem.Internal(w, "Library unavailable")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"items": items})
	})
	r.Put("/{id}", func(w http.ResponseWriter, r *http.Request) {
		u, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid item")
			return
		}
		var v item
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16000)).Decode(&v) != nil {
			problem.BadRequest(w, "invalid_item", "Invalid library item")
			return
		}
		v.Title = strings.TrimSpace(v.Title)
		link, e := url.Parse(v.URL)
		if len(v.Title) < 1 || len(v.Title) > 200 || len(v.Notes) > 8000 || len(v.URL) > 2000 || e != nil || link.Hostname() == "" || (link.Scheme != "https" && link.Scheme != "http") || (v.Kind != "book" && v.Kind != "article" && v.Kind != "video" && v.Kind != "reference") {
			problem.BadRequest(w, "invalid_item", "Add a title, valid web URL and resource type")
			return
		}
		result, err := pool.Exec(r.Context(), `INSERT INTO library_items(id,owner_id,title,url,kind,notes,completed) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,kind=excluded.kind,notes=excluded.notes,completed=excluded.completed WHERE library_items.owner_id=$2`, id, u.ID, v.Title, v.URL, v.Kind, v.Notes, v.Completed)
		if err != nil {
			problem.Internal(w, "Could not save item")
			return
		}
		if result.RowsAffected() == 0 {
			problem.BadRequest(w, "invalid_item", "Item unavailable")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	r.Delete("/{id}", func(w http.ResponseWriter, r *http.Request) {
		u, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid item")
			return
		}
		if _, err = pool.Exec(r.Context(), `DELETE FROM library_items WHERE id=$1 AND owner_id=$2`, id, u.ID); err != nil {
			problem.Internal(w, "Could not remove item")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	return r
}
