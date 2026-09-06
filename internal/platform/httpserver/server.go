package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/config"
)

// Run starts the HTTP server. apiHandler serves everything under /v1; it is
// composed by the caller (cmd/pharmaboard) from each module's routes so this
// package stays infrastructure-only and never imports a business module.
func Run(ctx context.Context, cfg config.Config, apiHandler http.Handler) error {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", health)
	mux.HandleFunc("GET /readyz", ready)
	if apiHandler != nil {
		mux.Handle("/v1/", http.StripPrefix("/v1", apiHandler))
	}

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           securityHeaders(cors(cfg)(requestLog(mux))),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("HTTP server listening", "address", cfg.HTTPAddr, "environment", cfg.Environment)
		errCh <- server.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func ready(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request completed", "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(started).Milliseconds())
	})
}

// cors allows the web console (a separate origin in development, e.g.
// http://localhost:5173) to call this API. Auth is bearer-token-based, not
// cookies, so reflecting Origin in development carries none of the CSRF
// risk it would with cookie auth — but production still requires an
// explicit allowlist via PHARMABOARD_ALLOWED_ORIGINS rather than reflecting
// any origin.
func cors(cfg config.Config) func(http.Handler) http.Handler {
	allowed := parseOrigins(cfg.AllowedOrigins)
	devMode := cfg.Environment != "production"

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (devMode || allowed[origin]) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func parseOrigins(csv string) map[string]bool {
	set := map[string]bool{}
	for _, origin := range strings.Split(csv, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			set[origin] = true
		}
	}
	return set
}
