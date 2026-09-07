package workspace

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PortfolioEntry struct {
	ID           uuid.UUID `json:"id"`
	Kind         string    `json:"kind"`
	Title        string    `json:"title"`
	Organization string    `json:"organization"`
	Period       string    `json:"period"`
	Description  string    `json:"description"`
	URL          string    `json:"url"`
}

func validPortfolio(v PortfolioEntry) bool {
	switch v.Kind {
	case "about", "experience", "education", "achievement", "project", "publication":
	default:
		return false
	}
	if len(v.Title) < 1 || len(v.Title) > 160 || len(v.Organization) > 160 || len(v.Period) > 100 || len(v.Description) > 8000 || len(v.URL) > 2048 {
		return false
	}
	if v.URL != "" {
		u, err := url.Parse(v.URL)
		if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
			return false
		}
	}
	return true
}
func portfolioRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/profiles/{userID}", func(w http.ResponseWriter, r *http.Request) {
		viewer, _ := identity.UserFromContext(r.Context())
		owner, err := uuid.Parse(chi.URLParam(r, "userID"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid profile ID")
			return
		}
		var exists bool
		if err = pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)`, owner).Scan(&exists); err != nil {
			problem.Internal(w, "Could not load profile")
			return
		}
		if !exists {
			problem.NotFound(w, "Profile not found")
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT id,kind,title,organization,period,description,url FROM profile_portfolio WHERE owner_id=$1 ORDER BY created_at DESC,id`, owner)
		if err != nil {
			problem.Internal(w, "Could not load portfolio")
			return
		}
		entries := []PortfolioEntry{}
		for rows.Next() {
			var v PortfolioEntry
			if err = rows.Scan(&v.ID, &v.Kind, &v.Title, &v.Organization, &v.Period, &v.Description, &v.URL); err != nil {
				rows.Close()
				problem.Internal(w, "Could not read portfolio")
				return
			}
			entries = append(entries, v)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			problem.Internal(w, "Could not read portfolio")
			return
		}
		var visible bool
		if err = pool.QueryRow(r.Context(), `SELECT COALESCE((SELECT visible FROM profile_learning_visibility WHERE owner_id=$1),false)`, owner).Scan(&visible); err != nil {
			problem.Internal(w, "Could not read visibility")
			return
		}
		learning := []map[string]any{}
		if visible || owner == viewer.ID {
			rows, err = pool.Query(r.Context(), `SELECT r.id,r.title,r.organization,s.completed FROM workspace_saved s JOIN workspace_resources r ON r.id=s.resource_id WHERE s.user_id=$1 AND r.kind='learning' ORDER BY r.created_at DESC,r.id`, owner)
			if err != nil {
				problem.Internal(w, "Could not load learning")
				return
			}
			for rows.Next() {
				var id uuid.UUID
				var title, organization string
				var completed bool
				if err = rows.Scan(&id, &title, &organization, &completed); err != nil {
					rows.Close()
					problem.Internal(w, "Could not read learning")
					return
				}
				learning = append(learning, map[string]any{"id": id, "title": title, "organization": organization, "completed": completed})
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				problem.Internal(w, "Could not read learning")
				return
			}
		}
		respond(w, 200, map[string]any{"entries": entries, "learning": learning, "learning_visible": visible})
	})
	r.Put("/profile/learning-visibility", func(w http.ResponseWriter, r *http.Request) {
		viewer, _ := identity.UserFromContext(r.Context())
		var v struct {
			Visible bool `json:"visible"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&v) != nil {
			problem.BadRequest(w, "invalid_json", "Invalid visibility")
			return
		}
		if _, err := pool.Exec(r.Context(), `INSERT INTO profile_learning_visibility(owner_id,visible) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET visible=EXCLUDED.visible`, viewer.ID, v.Visible); err != nil {
			problem.Internal(w, "Could not save visibility")
			return
		}
		w.WriteHeader(204)
	})
	r.Put("/portfolio/{id}", func(w http.ResponseWriter, r *http.Request) {
		viewer, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid entry ID")
			return
		}
		var v PortfolioEntry
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384)).Decode(&v) != nil {
			problem.BadRequest(w, "invalid_json", "Invalid entry")
			return
		}
		v.Title = strings.TrimSpace(v.Title)
		if !validPortfolio(v) {
			problem.BadRequest(w, "invalid_entry", "Check the title, field lengths and optional HTTPS link")
			return
		}
		tag, err := pool.Exec(r.Context(), `INSERT INTO profile_portfolio(id,owner_id,kind,title,organization,period,description,url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,organization=EXCLUDED.organization,period=EXCLUDED.period,description=EXCLUDED.description,url=EXCLUDED.url WHERE profile_portfolio.owner_id=$2`, id, viewer.ID, v.Kind, v.Title, v.Organization, v.Period, v.Description, v.URL)
		if err != nil {
			problem.Internal(w, "Could not save entry")
			return
		}
		if tag.RowsAffected() == 0 {
			problem.Forbidden(w, "Only the profile owner can edit this entry")
			return
		}
		respond(w, 200, map[string]any{"id": id})
	})
	r.Delete("/portfolio/{id}", func(w http.ResponseWriter, r *http.Request) {
		viewer, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid entry ID")
			return
		}
		tag, err := pool.Exec(r.Context(), `DELETE FROM profile_portfolio WHERE id=$1 AND owner_id=$2`, id, viewer.ID)
		if err != nil {
			problem.Internal(w, "Could not remove entry")
			return
		}
		if tag.RowsAffected() == 0 {
			problem.NotFound(w, "Entry not found or not owned by you")
			return
		}
		w.WriteHeader(204)
	})
}
