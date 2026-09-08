package community

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

func Routes(svc *Service, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)

	r.Route("/feed", func(r chi.Router) {
		r.Get("/", feedHandler(svc))
		r.Post("/", createPostHandler(svc))
	})

	r.Route("/posts/{id}", func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			u, ok := viewer(w, r)
			if !ok {
				return
			}
			id, ok := pathID(w, r)
			if !ok {
				return
			}
			p, err := svc.PostDetail(r.Context(), u.ID, id)
			if err != nil {
				writeServiceError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, postResponse(p))
		})
		r.Get("/comments", func(w http.ResponseWriter, r *http.Request) {
			id, ok := pathID(w, r)
			if !ok {
				return
			}
			page, _ := strconv.Atoi(r.URL.Query().Get("page"))
			items, more, err := svc.Comments(r.Context(), id, page)
			if err != nil {
				writeServiceError(w, err)
				return
			}
			out := []map[string]any{}
			for _, c := range items {
				out = append(out, map[string]any{"id": c.ID, "post_id": c.PostID, "parent_id": c.ParentID, "body": c.Body, "author": profileJSON(c.Author), "created_at": c.CreatedAt, "deleted": c.DeletedAt != nil})
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": out, "has_more": more})
		})
		r.Put("/comments/{commentID}", func(w http.ResponseWriter, r *http.Request) {
			u, ok := viewer(w, r)
			if !ok {
				return
			}
			id, ok := pathID(w, r)
			if !ok {
				return
			}
			commentID, err := uuid.Parse(chi.URLParam(r, "commentID"))
			if err != nil {
				problem.BadRequest(w, "invalid_id", "Invalid comment ID")
				return
			}
			var input struct {
				Body     string     `json:"body"`
				ParentID *uuid.UUID `json:"parent_id"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&input) != nil {
				problem.BadRequest(w, "invalid_json", "Invalid comment")
				return
			}
			if err = svc.Comment(r.Context(), u.ID, id, commentID, input.ParentID, input.Body); err != nil {
				writeServiceError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"id": commentID})
		})
		r.Delete("/comments/{commentID}", func(w http.ResponseWriter, r *http.Request) {
			u, ok := viewer(w, r)
			if !ok {
				return
			}
			id, ok := pathID(w, r)
			if !ok {
				return
			}
			commentID, err := uuid.Parse(chi.URLParam(r, "commentID"))
			if err != nil {
				problem.BadRequest(w, "invalid_id", "Invalid comment ID")
				return
			}
			if err = svc.DeleteComment(r.Context(), u.ID, id, commentID); err != nil {
				writeServiceError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Put("/reaction", setReactionHandler(svc, SubjectPost))
		r.Delete("/reaction", setReactionHandler(svc, SubjectPost))
		r.Post("/report", reportHandler(svc, SubjectPost))
	})

	r.Get("/network", networkHandler(svc))
	r.Route("/people/{id}", func(r chi.Router) {
		r.Get("/", profileHandler(svc))
		r.Put("/follow", followHandler(svc, true))
		r.Delete("/follow", followHandler(svc, false))
	})

	r.Route("/channels", func(r chi.Router) {
		r.Get("/", channelsHandler(svc))
		r.Post("/", createChannelHandler(svc))
	})

	r.Route("/forum", func(r chi.Router) {
		r.Get("/", threadsHandler(svc))
		r.Post("/", createThreadHandler(svc))
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", threadDetailHandler(svc))
			r.Post("/replies", replyHandler(svc))
			r.Put("/accepted-reply", acceptReplyHandler(svc))
			r.Put("/reaction", setReactionHandler(svc, SubjectThread))
			r.Delete("/reaction", setReactionHandler(svc, SubjectThread))
		})
	})

	r.Route("/replies/{id}", func(r chi.Router) {
		r.Put("/reaction", setReactionHandler(svc, SubjectReply))
		r.Delete("/reaction", setReactionHandler(svc, SubjectReply))
		r.Post("/report", reportHandler(svc, SubjectReply))
	})

	return r
}

func viewer(w http.ResponseWriter, r *http.Request) (identity.User, bool) {
	user, ok := identity.UserFromContext(r.Context())
	if !ok {
		problem.Unauthorized(w, "authentication required")
		return identity.User{}, false
	}
	return user, true
}

func pathID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		problem.BadRequest(w, "invalid_id", err.Error())
		return uuid.Nil, false
	}
	return id, true
}

func feedHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		before := uuid.Nil
		if v := r.URL.Query().Get("before"); v != "" {
			parsed, err := uuid.Parse(v)
			if err != nil {
				problem.BadRequest(w, "invalid_cursor", "before must be a UUID")
				return
			}
			before = parsed
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		scope := ScopeEveryone
		if r.URL.Query().Get("scope") == "following" {
			scope = ScopeFollowing
		}

		posts, err := svc.Feed(r.Context(), user.ID, scope, before, limit, r.URL.Query().Get("q"))
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, feedResponse(posts))
	}
}

func createPostHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Body string `json:"body"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		post, err := svc.CreatePost(r.Context(), user.ID, req.Body)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, postResponse(post))
	}
}

// setReactionHandler serves both PUT (react) and DELETE (unreact) — the verb
// carries the desired state, which keeps the operation idempotent by
// construction rather than by a toggle the client has to reason about.
func setReactionHandler(svc *Service, subject SubjectType) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		if err := svc.SetReaction(r.Context(), subject, id, user.ID, r.Method == http.MethodPut); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"reacted": r.Method == http.MethodPut})
	}
}

func followHandler(svc *Service, on bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var err error
		if on {
			err = svc.Follow(r.Context(), user.ID, id)
		} else {
			err = svc.Unfollow(r.Context(), user.ID, id)
		}
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"following": on})
	}
}

func profileHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		view, err := svc.ProfileView(r.Context(), user.ID, id)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"profile":        profileJSON(view.Profile),
			"stats":          map[string]int{"posts": view.Stats.Posts, "followers": view.Stats.Followers, "following": view.Stats.Following},
			"viewer_follows": view.ViewerFollows,
			"is_self":        view.IsSelf,
			"posts":          feedResponse(view.Posts)["items"],
		})
	}
}

func threadsHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

		var channelID *uuid.UUID
		if raw := r.URL.Query().Get("channel_id"); raw != "" {
			id, err := uuid.Parse(raw)
			if err != nil {
				problem.BadRequest(w, "invalid_channel", "channel_id must be a UUID")
				return
			}
			channelID = &id
		}

		threads, err := svc.Threads(r.Context(), user.ID, r.URL.Query().Get("q"), channelID, page, limit)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		items := make([]map[string]any, len(threads))
		for i, t := range threads {
			items[i] = threadResponse(t)
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	}
}

func createThreadHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Title     string     `json:"title"`
		Body      string     `json:"body"`
		Tags      []string   `json:"tags"`
		ChannelID *uuid.UUID `json:"channel_id"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		thread, err := svc.CreateThread(r.Context(), user.ID, req.Title, req.Body, req.Tags, req.ChannelID)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": thread.ID, "title": thread.Title})
	}
}

func channelsHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := viewer(w, r); !ok {
			return
		}
		channels, err := svc.Channels(r.Context())
		if err != nil {
			writeServiceError(w, err)
			return
		}
		items := make([]map[string]any, len(channels))
		for i, c := range channels {
			items[i] = channelResponse(c)
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	}
}

func createChannelHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		channel, err := svc.CreateChannel(r.Context(), user.ID, req.Name, req.Description)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, channelResponse(channel))
	}
}

func threadDetailHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		detail, err := svc.ThreadDetail(r.Context(), user.ID, id)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		replies := make([]map[string]any, len(detail.Replies))
		for i, reply := range detail.Replies {
			replies[i] = map[string]any{
				"id":             reply.ID,
				"body":           reply.Body,
				"author":         profileJSON(reply.Author),
				"reaction_count": reply.ReactionCount,
				"viewer_reacted": reply.ViewerReacted,
				"accepted":       reply.Accepted,
				"created_at":     reply.CreatedAt,
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"thread":  threadResponse(detail.Thread),
			"replies": replies,
		})
	}
}

func replyHandler(svc *Service) http.HandlerFunc {
	type request struct {
		Body string `json:"body"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		reply, err := svc.Reply(r.Context(), user.ID, id, req.Body)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": reply.ID})
	}
}

func acceptReplyHandler(svc *Service) http.HandlerFunc {
	type request struct {
		ReplyID uuid.UUID `json:"reply_id"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		if err := svc.AcceptReply(r.Context(), user.ID, id, req.ReplyID); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
	}
}

func reportHandler(svc *Service, subject SubjectType) http.HandlerFunc {
	type request struct {
		Reason string `json:"reason"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := viewer(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}
		if err := svc.Report(r.Context(), user.ID, subject, id, req.Reason); err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "reported"})
	}
}

// --- response shaping ------------------------------------------------------

func profileJSON(p identity.Profile) map[string]any {
	return map[string]any{
		"id":                 p.ID,
		"display_name":       p.DisplayName,
		"account_kind":       p.AccountKind,
		"verification_state": p.VerificationState,
		"practice_area":      p.PracticeArea,
		"institution":        p.Institution,
		"region_code":        p.RegionCode,
	}
}

func postResponse(p FeedPost) map[string]any {
	return map[string]any{
		"id":             p.ID,
		"body":           p.Body,
		"author":         profileJSON(p.Author),
		"reaction_count": p.ReactionCount,
		"reply_count":    p.ReplyCount,
		"viewer_reacted": p.ViewerReacted,
		"viewer_follows": p.ViewerFollows,
		"created_at":     p.CreatedAt,
	}
}

func feedResponse(posts []FeedPost) map[string]any {
	items := make([]map[string]any, len(posts))
	var next *uuid.UUID
	for i, p := range posts {
		items[i] = postResponse(p)
		id := p.ID
		next = &id
	}
	body := map[string]any{"items": items}
	if next != nil {
		body["next_cursor"] = next
	}
	return body
}

func threadResponse(t ForumThreadView) map[string]any {
	return map[string]any{
		"id":               t.ID,
		"channel_id":       t.ChannelID,
		"title":            t.Title,
		"body":             t.Body,
		"tags":             t.Tags,
		"author":           profileJSON(t.Author),
		"reply_count":      t.ReplyCount,
		"reaction_count":   t.ReactionCount,
		"viewer_reacted":   t.ViewerReacted,
		"has_accepted":     t.AcceptedReplyID != nil,
		"created_at":       t.CreatedAt,
		"last_activity_at": t.LastActivityAt,
	}
}

func channelResponse(c Channel) map[string]any {
	return map[string]any{
		"id":           c.ID,
		"slug":         c.Slug,
		"name":         c.Name,
		"description":  c.Description,
		"thread_count": c.ThreadCount,
		"created_at":   c.CreatedAt,
		// True for the handful of starter channels seeded by migration
		// 000014 (no member authored them) — distinct from whether the
		// *viewer* created a channel, which the client already knows locally
		// right after a successful create.
		"official": c.CreatedBy == nil,
	}
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		problem.NotFound(w, err.Error())
	case errors.Is(err, ErrValidation):
		problem.BadRequest(w, "validation_failed", err.Error())
	case errors.Is(err, ErrForbidden):
		problem.Forbidden(w, err.Error())
	case errors.Is(err, ErrSelfFollow):
		problem.BadRequest(w, "self_follow", err.Error())
	case errors.Is(err, ErrAlreadyExists):
		problem.Conflict(w, "already_exists", err.Error())
	default:
		problem.Internal(w, "an unexpected error occurred")
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
