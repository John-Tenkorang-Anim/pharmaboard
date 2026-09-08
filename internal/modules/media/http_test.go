package media

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

type authRepo struct {
	identity.Repository
	id uuid.UUID
}

func (r authRepo) FindSessionByTokenHash(context.Context, []byte) (uuid.UUID, error) {
	return r.id, nil
}
func (r authRepo) FindByID(context.Context, uuid.UUID) (identity.User, error) {
	return identity.User{ID: r.id}, nil
}
func TestMediaPersistenceAndAuthorization(t *testing.T) {
	url := os.Getenv("PHARMABOARD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires migrated test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	owner, viewer := uuid.New(), uuid.New()
	if _, err = pool.Exec(ctx, `INSERT INTO users(id,account_kind,display_name,email) VALUES($1,'student','Ama Mensah',$2)`, owner, owner.String()+"@example.com"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		pool.Exec(ctx, `DELETE FROM media_objects WHERE owner_id=$1`, owner)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()
	id := ""
	published := false
	resolve := func(context.Context, uuid.UUID, string, uuid.UUID) (uuid.UUID, string, error) {
		if !published {
			return uuid.Nil, "", fmt.Errorf("not published")
		}
		return owner, "[media:" + id + "]", nil
	}
	routes := func(user uuid.UUID) http.Handler {
		return Routes(pool, identity.RequireAuth(identity.NewService(authRepo{id: user}, "production")), resolve)
	}
	request := func(user uuid.UUID, method, path string, body []byte, token bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewReader(body))
		if token {
			r.Header.Set("Authorization", "Bearer test")
		}
		w := httptest.NewRecorder()
		routes(user).ServeHTTP(w, r)
		return w
	}
	var img bytes.Buffer
	png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 32, 32)))
	if w := request(owner, "POST", "/", img.Bytes(), false); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := request(owner, "POST", "/", []byte("<html>not an image</html>"), true); w.Code != 400 {
		t.Fatal(w.Code)
	}
	w := request(owner, "POST", "/", img.Bytes(), true)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		ID string `json:"id"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	id = result.ID
	if w = request(owner, "GET", "/"+id, nil, true); w.Code != 200 || w.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatal(w.Code)
	}
	source := uuid.NewString()
	path := "/" + id + "?kind=post&source=" + source
	if w = request(viewer, "GET", path, nil, true); w.Code != 404 {
		t.Fatalf("draft leaked: %d", w.Code)
	}
	published = true
	if w = request(viewer, "GET", path, nil, true); w.Code != 200 {
		t.Fatalf("published inaccessible: %d", w.Code)
	}
	if w = request(viewer, "GET", "/"+id, nil, true); w.Code != 404 {
		t.Fatalf("missing source allowed: %d", w.Code)
	}
}
