package identity

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"image"
	"image/jpeg"
	_ "image/png"
	"net/http"
)

// Photos are bounded, normalized JPEGs persisted in PostgreSQL, so free
// hosting restarts do not lose them. Decoding and re-encoding removes metadata.
func photoUpload(s *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "Sign in first")
			return
		}
		var req struct {
			Image string `json:"image"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1500000)).Decode(&req) != nil {
			problem.BadRequest(w, "invalid_photo", "Choose a JPEG or PNG photo under 1 MB")
			return
		}
		encoded := ""
		if req.Image != "" {
			raw, err := base64.StdEncoding.DecodeString(req.Image)
			if err != nil || len(raw) > 1024*1024 {
				problem.BadRequest(w, "invalid_photo", "Photo is too large")
				return
			}
			cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
			if err != nil || (format != "jpeg" && format != "png") || cfg.Width > 1024 || cfg.Height > 1024 || cfg.Width < 1 || cfg.Height < 1 {
				problem.BadRequest(w, "invalid_photo", "Use a JPEG or PNG up to 1024 pixels wide and high")
				return
			}
			img, _, err := image.Decode(bytes.NewReader(raw))
			if err != nil {
				problem.BadRequest(w, "invalid_photo", "Photo could not be read")
				return
			}
			var output bytes.Buffer
			if jpeg.Encode(&output, img, &jpeg.Options{Quality: 85}) != nil {
				problem.Internal(w, "Photo could not be saved")
				return
			}
			encoded = "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(output.Bytes())
		}
		if err := s.repo.SavePhoto(r.Context(), user.ID, encoded); err != nil {
			problem.Internal(w, "Photo could not be saved")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"image": encoded})
	}
}
func photoRead(s *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", "Invalid member")
			return
		}
		photo, err := s.repo.ReadPhoto(r.Context(), id)
		if err != nil {
			problem.NotFound(w, "Member not found")
			return
		}
		w.Header().Set("Cache-Control", "private, no-store")
		writeJSON(w, http.StatusOK, map[string]string{"image": photo})
	}
}

func (r *PostgresRepository) SavePhoto(ctx context.Context, id uuid.UUID, photo string) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET avatar_object_key=NULLIF($2,''),updated_at=now(),version=version+1 WHERE id=$1 AND deleted_at IS NULL`, id, photo)
	return err
}
func (r *PostgresRepository) ReadPhoto(ctx context.Context, id uuid.UUID) (string, error) {
	var photo string
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(avatar_object_key,'') FROM users WHERE id=$1 AND deleted_at IS NULL`, id).Scan(&photo)
	return photo, err
}
