package identity

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"github.com/google/uuid"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type photoRepo struct {
	Repository
	id    uuid.UUID
	saved string
}

func (r *photoRepo) FindSessionByTokenHash(context.Context, []byte) (uuid.UUID, error) {
	return r.id, nil
}
func (r *photoRepo) FindByID(context.Context, uuid.UUID) (User, error) { return User{ID: r.id}, nil }
func (r *photoRepo) SavePhoto(_ context.Context, id uuid.UUID, p string) error {
	if id != r.id {
		panic("wrong owner")
	}
	r.saved = p
	return nil
}
func TestPhotoUploadValidationAndOwnership(t *testing.T) {
	repo := &photoRepo{id: uuid.New()}
	routes := Routes(NewService(repo, "production"))
	var img bytes.Buffer
	png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 12, 12)))
	for _, tc := range []struct {
		token, payload string
		status         int
	}{
		{"", `{"image":""}`, 401},
		{"session", `{"image":"not base64"}`, 400},
		{"session", fmt.Sprintf(`{"image":%q}`, base64.StdEncoding.EncodeToString([]byte("<svg/>"))), 400},
		{"session", fmt.Sprintf(`{"image":%q}`, base64.StdEncoding.EncodeToString(img.Bytes())), 200},
	} {
		req := httptest.NewRequest(http.MethodPut, "/photo", strings.NewReader(tc.payload))
		if tc.token != "" {
			req.Header.Set("Authorization", "Bearer "+tc.token)
		}
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, req)
		if w.Code != tc.status {
			t.Fatalf("got %d want %d: %s", w.Code, tc.status, w.Body.String())
		}
	}
	if !strings.HasPrefix(repo.saved, "data:image/jpeg;base64,") {
		t.Fatal("photo not normalized")
	}
	req := httptest.NewRequest(http.MethodPut, "/photo", strings.NewReader(`{"image":""}`))
	req.Header.Set("Authorization", "Bearer session")
	w := httptest.NewRecorder()
	routes.ServeHTTP(w, req)
	if w.Code != 200 || repo.saved != "" {
		t.Fatal("remove failed")
	}
}
