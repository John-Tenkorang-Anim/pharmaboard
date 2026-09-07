package identity

import (
	"encoding/json"
	"errors"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
	"net/http"
)

func credentialsHandler(s *Service, mode string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		var req struct {
			registerRequest
			Password   string `json:"password"`
			Credential string `json:"credential"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384)).Decode(&req) != nil {
			problem.BadRequest(w, "invalid_json", "Invalid sign-in request")
			return
		}
		in := RegisterInput{AccountKind: AccountKind(req.AccountKind), DisplayName: req.DisplayName, Email: req.Email, Institution: req.Institution, PracticeArea: req.PracticeArea}
		var session Session
		var err error
		switch mode {
		case "signup":
			session, err = s.CreateAccount(r.Context(), in, req.Password, "")
		case "google":
			session, err = s.GoogleLogin(r.Context(), req.Credential, in)
		default:
			email := ""
			if req.Email != nil {
				email = *req.Email
			}
			session, err = s.PasswordLogin(r.Context(), email, req.Password)
		}
		if errors.Is(err, errGoogleSignup) {
			problem.BadRequest(w, "profile_required", err.Error())
			return
		}
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"access_token": session.Token, "token_type": "Bearer", "expires_at": session.ExpiresAt})
	}
}
