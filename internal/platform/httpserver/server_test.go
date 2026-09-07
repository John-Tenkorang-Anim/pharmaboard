package httpserver

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealth(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	health(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
}

func TestReadinessChecksDatabase(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{{"available", nil, 200}, {"unavailable", errors.New("private connection details"), 503}} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ready(func(ctx context.Context) error {
				if _, ok := ctx.Deadline(); !ok {
					t.Fatal("readiness must bound database checks")
				}
				return tc.err
			})(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))
			if recorder.Code != tc.status {
				t.Fatalf("status %d, want %d", recorder.Code, tc.status)
			}
			if strings.Contains(recorder.Body.String(), "private") {
				t.Fatal("readiness leaked connection details")
			}
		})
	}
	recorder := httptest.NewRecorder()
	ready(nil)(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if recorder.Code != 503 {
		t.Fatal("missing check must not claim readiness")
	}
}
