package community

import (
	"context"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"github.com/google/uuid"
	"net/http"
	"sort"
	"strings"
)

type NetworkCandidate struct {
	ID     uuid.UUID
	Mutual int
}

func (r *PostgresRepository) NetworkIDs(ctx context.Context, viewer uuid.UUID, mode string, after uuid.UUID) ([]NetworkCandidate, error) {
	query := `SELECT followee_id,0 FROM follows WHERE follower_id=$1 AND followee_id>$2 ORDER BY followee_id LIMIT 31`
	if mode == "followers" {
		query = `SELECT follower_id,0 FROM follows WHERE followee_id=$1 AND follower_id>$2 ORDER BY follower_id LIMIT 31`
	}
	if mode == "suggested" {
		query = `SELECT b.followee_id,count(*) FROM follows a JOIN follows b ON b.follower_id=a.followee_id WHERE a.follower_id=$1 AND b.followee_id<>$1 AND b.followee_id>$2 AND NOT EXISTS(SELECT 1 FROM follows c WHERE c.follower_id=$1 AND c.followee_id=b.followee_id) GROUP BY b.followee_id ORDER BY count(*) DESC,b.followee_id LIMIT 50`
	}
	rows, err := r.pool.Query(ctx, query, viewer, after)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NetworkCandidate{}
	for rows.Next() {
		var c NetworkCandidate
		if err = rows.Scan(&c.ID, &c.Mutual); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func networkHandler(s *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := identity.UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "Sign in first")
			return
		}
		mode := r.URL.Query().Get("view")
		if mode != "following" && mode != "followers" && mode != "discover" && mode != "suggested" {
			problem.BadRequest(w, "invalid_view", "Choose a network view")
			return
		}
		after := uuid.Nil
		if v := r.URL.Query().Get("after"); v != "" {
			var err error
			after, err = uuid.Parse(v)
			if err != nil {
				problem.BadRequest(w, "invalid_cursor", "Invalid cursor")
				return
			}
		}
		following, err := s.repo.FollowingIDs(r.Context(), user.ID)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		set := map[uuid.UUID]bool{}
		for _, id := range following {
			set[id] = true
		}
		candidates := []NetworkCandidate{}
		profiles := map[uuid.UUID]identity.Profile{}
		next := ""
		if mode == "following" || mode == "followers" || mode == "suggested" {
			candidates, err = s.repo.NetworkIDs(r.Context(), user.ID, mode, after)
			if err != nil {
				writeServiceError(w, err)
				return
			}
			if mode != "suggested" && len(candidates) > 30 {
				candidates = candidates[:30]
				next = candidates[29].ID.String()
			}
			ids := []uuid.UUID{}
			for _, c := range candidates {
				ids = append(ids, c.ID)
			}
			profiles, err = s.hydrateAuthors(r.Context(), ids)
			if err != nil {
				writeServiceError(w, err)
				return
			}
		}
		if mode == "discover" || mode == "suggested" {
			directory, ok := s.profiles.(interface {
				SearchDirectory(context.Context, identity.DirectoryQuery) ([]identity.Profile, error)
			})
			if !ok {
				problem.Internal(w, "Directory unavailable")
				return
			}
			list, err := directory.SearchDirectory(r.Context(), identity.DirectoryQuery{Search: r.URL.Query().Get("q"), After: after, Limit: 30})
			if err != nil {
				writeServiceError(w, err)
				return
			}
			if mode == "discover" && len(list) == 30 {
				next = list[29].ID.String()
			}
			for _, p := range list {
				if _, found := profiles[p.ID]; !found {
					profiles[p.ID] = p
					candidates = append(candidates, NetworkCandidate{ID: p.ID})
				}
			}
		}
		type ranked struct {
			data  map[string]any
			score int
		}
		items := []ranked{}
		for _, c := range candidates {
			p, exists := profiles[c.ID]
			if !exists || p.ID == user.ID {
				continue
			}
			if mode == "suggested" && set[p.ID] {
				continue
			}
			if mode != "discover" && r.URL.Query().Get("q") != "" && !strings.Contains(strings.ToLower(p.DisplayName), strings.ToLower(r.URL.Query().Get("q"))) {
				continue
			}
			score := c.Mutual * 10
			reason := "Explore this member’s profile"
			if c.Mutual > 0 {
				reason = "Followed by people you follow"
			}
			same := func(a, b *string) bool {
				return a != nil && b != nil && strings.TrimSpace(*a) != "" && strings.EqualFold(strings.TrimSpace(*a), strings.TrimSpace(*b))
			}
			if same(p.Institution, user.Institution) {
				score += 5
				if c.Mutual == 0 {
					reason = "Same school or organisation"
				}
			}
			if same(p.PracticeArea, user.PracticeArea) {
				score += 3
				if c.Mutual == 0 && !same(p.Institution, user.Institution) {
					reason = "Shared field of study or work"
				}
			}
			row := profileJSON(p)
			row["viewer_follows"] = set[p.ID]
			row["mutual_count"] = c.Mutual
			row["suggestion_reason"] = reason
			items = append(items, ranked{row, score})
		}
		if mode == "suggested" {
			sort.SliceStable(items, func(i, j int) bool { return items[i].score > items[j].score })
			if len(items) > 20 {
				items = items[:20]
			}
		}
		response := []map[string]any{}
		for _, item := range items {
			response = append(response, item.data)
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": response, "next_cursor": next})
	}
}
