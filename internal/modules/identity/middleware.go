package identity

import (
	"context"
	"net/http"
	"strings"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
)

type contextKey int

const userContextKey contextKey = 0

// RequireAuth authenticates the bearer token on every request and rejects
// the request with 401 if it is missing or invalid. Handlers read the
// authenticated user with UserFromContext.
func RequireAuth(svc *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, ok := bearerToken(r)
			if !ok {
				problem.Unauthorized(w, "missing bearer token")
				return
			}

			user, err := svc.Authenticate(r.Context(), token)
			if err != nil {
				problem.Unauthorized(w, "invalid or expired session")
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func bearerToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return "", false
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, prefix))
	return token, token != ""
}

// UserFromContext returns the authenticated user attached by RequireAuth.
// Other modules use this, never a direct users-table query, to learn who
// is making a request.
func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey).(User)
	return user, ok
}
