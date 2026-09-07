// Package workspace owns shared learning resources, career listings and scheduled sessions.
package workspace

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"errors"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Resource struct {
	ID           uuid.UUID  `json:"id"`
	OwnerID      uuid.UUID  `json:"owner_id"`
	Kind         string     `json:"kind"`
	Title        string     `json:"title"`
	Description  string     `json:"description"`
	Category     string     `json:"category"`
	Organization string     `json:"organization"`
	Location     string     `json:"location"`
	URL          string     `json:"url"`
	StartsAt     *time.Time `json:"starts_at"`
	CreatedAt    time.Time  `json:"created_at"`
	Saved        bool       `json:"saved"`
	Completed    bool       `json:"completed"`
}

var meetingCodePattern = regexp.MustCompile(`^[A-F0-9]{12}$`)

func normalizeMeetingCode(code string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
}

var videoID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

func validResource(v Resource) bool {
	if v.Kind != "learning" && v.Kind != "jobs" && v.Kind != "sessions" {
		return false
	}
	if len(v.Title) < 1 || len(v.Title) > 160 || len(v.Description) < 1 || len(v.Description) > 8000 || len(v.Category) < 1 || len(v.Category) > 80 || len(v.Organization) < 1 || len(v.Organization) > 160 || len(v.Location) > 160 || len(v.URL) > 2048 {
		return false
	}
	u, err := url.Parse(v.URL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Port() != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if v.Kind == "learning" {
		return (host == "www.youtube.com" || host == "youtube.com") && u.Path == "/watch" && videoID.MatchString(u.Query().Get("v")) || host == "youtu.be" && videoID.MatchString(strings.TrimPrefix(u.Path, "/"))
	}
	if v.Kind == "sessions" {
		return v.StartsAt != nil && (host == "teams.microsoft.com" || host == "teams.live.com" || host == "meet.jit.si") && len(u.Path) > 1
	}
	return true
}

func Routes(pool *pgxpool.Pool, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)
	portfolioRoutes(r, pool)

	r.Get("/join/{code}", func(w http.ResponseWriter, r *http.Request) {
		user, _ := identity.UserFromContext(r.Context())
		code := normalizeMeetingCode(chi.URLParam(r, "code"))
		if !meetingCodePattern.MatchString(code) {
			problem.BadRequest(w, "invalid_meeting_code", "Enter a 12-character meeting code, such as AB12-CD34-EF56.")
			return
		}
		var v Resource
		err := pool.QueryRow(r.Context(), `SELECT r.id,r.owner_id,r.kind,r.title,r.description,r.category,r.organization,r.location,r.url,r.starts_at,r.created_at,s.user_id IS NOT NULL,COALESCE(s.completed,false) FROM workspace_resources r LEFT JOIN workspace_saved s ON s.resource_id=r.id AND s.user_id=$1 WHERE r.kind='sessions' AND upper(right(replace(r.id::text,'-',''),12))=$2`, user.ID, code).Scan(&v.ID, &v.OwnerID, &v.Kind, &v.Title, &v.Description, &v.Category, &v.Organization, &v.Location, &v.URL, &v.StartsAt, &v.CreatedAt, &v.Saved, &v.Completed)
		if errors.Is(err, pgx.ErrNoRows) {
			problem.NotFound(w, "No meeting matches that code. Check the invitation or ask the host for a new code.")
			return
		}
		if err != nil {
			problem.Internal(w, "Could not find the meeting")
			return
		}
		respond(w, http.StatusOK, v)
	})
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		user, _ := identity.UserFromContext(r.Context())
		kind := r.URL.Query().Get("kind")
		q := r.URL.Query().Get("q")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 0 || page > 10000 {
			problem.BadRequest(w, "invalid_page", "Invalid page")
			return
		}
		category := r.URL.Query().Get("category")
		saved := r.URL.Query().Get("saved") == "true"
		if len(q) > 200 {
			problem.BadRequest(w, "invalid_query", "Search is too long")
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT r.id,r.owner_id,r.kind,r.title,r.description,r.category,r.organization,r.location,r.url,r.starts_at,r.created_at,s.user_id IS NOT NULL,COALESCE(s.completed,false) FROM workspace_resources r LEFT JOIN workspace_saved s ON s.resource_id=r.id AND s.user_id=$1 WHERE r.kind=$2 AND ($3='' OR r.title ILIKE '%' || $3 || '%' OR r.organization ILIKE '%' || $3 || '%' OR r.category ILIKE '%' || $3 || '%' OR r.location ILIKE '%' || $3 || '%') AND ($4='' OR r.category=$4) AND (NOT $5 OR s.user_id IS NOT NULL) ORDER BY r.created_at DESC,r.id LIMIT 51 OFFSET $6`, user.ID, kind, q, category, saved, page*50)
		if err != nil {
			problem.Internal(w, "Could not load resources")
			return
		}
		defer rows.Close()
		items := []Resource{}
		for rows.Next() {
			var v Resource
			if err := rows.Scan(&v.ID, &v.OwnerID, &v.Kind, &v.Title, &v.Description, &v.Category, &v.Organization, &v.Location, &v.URL, &v.StartsAt, &v.CreatedAt, &v.Saved, &v.Completed); err != nil {
				problem.Internal(w, "Could not read resources")
				return
			}
			items = append(items, v)
		}
		if rows.Err() != nil {
			problem.Internal(w, "Could not read resources")
			return
		}
		hasMore := len(items) > 50
		if hasMore {
			items = items[:50]
		}
		respond(w, http.StatusOK, map[string]any{"items": items, "has_more": hasMore})
	})
	// Client-assigned IDs make retries safe without duplicate publications.
	r.Put("/{id}", func(w http.ResponseWriter, r *http.Request) {
		user, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid resource ID")
			return
		}
		var v Resource
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384)).Decode(&v) != nil {
			problem.BadRequest(w, "invalid_json", "Invalid resource")
			return
		}
		v.Title = strings.TrimSpace(v.Title)
		v.Description = strings.TrimSpace(v.Description)
		v.Organization = strings.TrimSpace(v.Organization)
		if !validResource(v) {
			problem.BadRequest(w, "invalid_resource", "Check required fields and provide a supported HTTPS link. Sessions require a start time.")
			return
		}
		tag, err := pool.Exec(r.Context(), `INSERT INTO workspace_resources(id,owner_id,kind,title,description,category,organization,location,url,starts_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,organization=EXCLUDED.organization,location=EXCLUDED.location,url=EXCLUDED.url,starts_at=EXCLUDED.starts_at WHERE workspace_resources.owner_id=$2 AND workspace_resources.kind=EXCLUDED.kind`, id, user.ID, v.Kind, v.Title, v.Description, v.Category, v.Organization, v.Location, v.URL, v.StartsAt)
		if err != nil {
			problem.Internal(w, "Could not save resource")
			return
		}
		if tag.RowsAffected() == 0 {
			problem.Forbidden(w, "Only the author can edit this resource")
			return
		}
		respond(w, http.StatusOK, map[string]any{"id": id})
	})
	r.Delete("/{id}", func(w http.ResponseWriter, r *http.Request) {
		user, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid ID")
			return
		}
		tag, err := pool.Exec(r.Context(), `DELETE FROM workspace_resources WHERE id=$1 AND owner_id=$2`, id, user.ID)
		if err != nil {
			problem.Internal(w, "Could not remove resource")
			return
		}
		if tag.RowsAffected() == 0 {
			problem.NotFound(w, "Resource not found or not owned by you")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	r.Put("/{id}/saved", func(w http.ResponseWriter, r *http.Request) {
		user, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid ID")
			return
		}
		var state struct {
			Saved     bool `json:"saved"`
			Completed bool `json:"completed"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&state) != nil {
			problem.BadRequest(w, "invalid_json", "Invalid state")
			return
		}
		if state.Saved {
			var exists bool
			err = pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM workspace_resources WHERE id=$1)`, id).Scan(&exists)
			if err != nil {
				problem.Internal(w, "Could not load resource")
				return
			}
			if !exists {
				problem.NotFound(w, "Resource not found")
				return
			}
			_, err = pool.Exec(r.Context(), `INSERT INTO workspace_saved(user_id,resource_id,completed) VALUES($1,$2,$3) ON CONFLICT(user_id,resource_id) DO UPDATE SET completed=EXCLUDED.completed`, user.ID, id, state.Completed)
		} else {
			_, err = pool.Exec(r.Context(), `DELETE FROM workspace_saved WHERE user_id=$1 AND resource_id=$2`, user.ID, id)
		}
		if err != nil {
			problem.Internal(w, "Could not save your preference")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	return r
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
