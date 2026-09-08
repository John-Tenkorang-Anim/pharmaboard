package media

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"time"
)

// ResolveSource returns the author and saved body of a publication the viewer may read.
type ResolveSource func(context.Context, uuid.UUID, string, uuid.UUID) (uuid.UUID, string, error)

func Routes(pool *pgxpool.Pool, auth func(http.Handler) http.Handler, resolve ResolveSource) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)
	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		viewer, _ := identity.UserFromContext(r.Context())
		controller := http.NewResponseController(w)
		_ = controller.SetReadDeadline(time.Now().Add(2 * time.Minute))
		_ = controller.SetWriteDeadline(time.Now().Add(2 * time.Minute))
		data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 20*1024*1024))
		if err != nil || len(data) == 0 {
			problem.BadRequest(w, "invalid_media", "Choose a photo or video up to 20 MB")
			return
		}
		mime := http.DetectContentType(data)
		switch mime {
		case "image/jpeg", "image/png":
			cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
			if err != nil || cfg.Width > 4096 || cfg.Height > 4096 || cfg.Width < 1 || cfg.Height < 1 {
				problem.BadRequest(w, "invalid_media", "Choose an image no larger than 4096 × 4096")
				return
			}
			img, _, err := image.Decode(bytes.NewReader(data))
			if err != nil {
				problem.BadRequest(w, "invalid_media", "This image could not be read")
				return
			}
			var normalized bytes.Buffer
			if jpeg.Encode(&normalized, img, &jpeg.Options{Quality: 85}) != nil {
				problem.BadRequest(w, "invalid_media", "This image could not be read")
				return
			}
			data = normalized.Bytes()
			mime = "image/jpeg"
		case "video/mp4", "video/webm":
		default:
			problem.BadRequest(w, "invalid_media", "Supported formats: JPEG, PNG, MP4 and WebM")
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			problem.Internal(w, "Upload unavailable")
			return
		}
		defer tx.Rollback(r.Context())
		// Serialize a member's uploads so concurrent requests cannot bypass the quota.
		if _, err = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, viewer.ID.String()); err != nil {
			problem.Internal(w, "Upload unavailable")
			return
		}
		var used int64
		if err = tx.QueryRow(r.Context(), `SELECT COALESCE(sum(octet_length(data)),0) FROM media_objects WHERE owner_id=$1`, viewer.ID).Scan(&used); err != nil {
			problem.Internal(w, "Upload unavailable")
			return
		}
		if used+int64(len(data)) > 100*1024*1024 {
			problem.Write(w, 413, "storage_limit", "Storage limit", "Your media storage limit is 100 MB. Contact the platform administrator for more space.")
			return
		}
		id := uuid.Must(uuid.NewV7())
		if _, err = tx.Exec(r.Context(), `INSERT INTO media_objects(id,owner_id,mime_type,data) VALUES($1,$2,$3,$4)`, id, viewer.ID, mime, data); err != nil {
			problem.Internal(w, "Upload failed")
			return
		}
		if tx.Commit(r.Context()) != nil {
			problem.Internal(w, "Upload failed")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		json.NewEncoder(w).Encode(map[string]any{"id": id, "mime_type": mime})
	})
	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		viewer, _ := identity.UserFromContext(r.Context())
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.NotFound(w, "Media not found")
			return
		}
		var owner uuid.UUID
		var mime string
		if err = pool.QueryRow(r.Context(), `SELECT owner_id,mime_type FROM media_objects WHERE id=$1`, id).Scan(&owner, &mime); err != nil {
			problem.NotFound(w, "Media not found")
			return
		}
		if owner != viewer.ID {
			source, err := uuid.Parse(r.URL.Query().Get("source"))
			if err != nil {
				problem.NotFound(w, "Media not found")
				return
			}
			author, body, err := resolve(r.Context(), viewer.ID, r.URL.Query().Get("kind"), source)
			if err != nil || author != owner || !bytes.Contains([]byte(body), []byte("[media:"+id.String()+"]")) {
				problem.NotFound(w, "Media not found")
				return
			}
		}
		var data []byte
		if pool.QueryRow(r.Context(), `SELECT data FROM media_objects WHERE id=$1`, id).Scan(&data) != nil {
			problem.NotFound(w, "Media not found")
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "private, no-store")
		http.ServeContent(w, r, "media", time.Time{}, bytes.NewReader(data))
	})
	return r
}
