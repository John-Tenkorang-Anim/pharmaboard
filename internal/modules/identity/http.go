package identity

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
)

// Routes mounts the identity module's public HTTP surface: registration and
// the dev-OTP login flow described in service.go. /me requires an
// authenticated session.
func Routes(svc *Service) chi.Router {
	r := chi.NewRouter()
	r.Post("/register", registerHandler(svc))
	r.Post("/otp/request", requestOTPHandler(svc))
	r.Post("/otp/verify", verifyOTPHandler(svc))
	r.With(RequireAuth(svc)).Get("/me", meHandler())
	return r
}

type registerRequest struct {
	AccountKind  string  `json:"account_kind"`
	DisplayName  string  `json:"display_name"`
	PhoneE164    *string `json:"phone_e164"`
	Email        *string `json:"email"`
	RegionCode   *string `json:"region_code"`
	PracticeArea *string `json:"practice_area"`
}

func registerHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req registerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}

		user, err := svc.Register(r.Context(), RegisterInput{
			AccountKind:  AccountKind(req.AccountKind),
			DisplayName:  req.DisplayName,
			PhoneE164:    req.PhoneE164,
			Email:        req.Email,
			RegionCode:   req.RegionCode,
			PracticeArea: req.PracticeArea,
		})
		if err != nil {
			writeServiceError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, userResponse(user))
	}
}

type otpRequestRequest struct {
	Channel string `json:"channel"`
	Contact string `json:"contact"`
}

func requestOTPHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req otpRequestRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}

		result, err := svc.RequestOTP(r.Context(), Channel(req.Channel), req.Contact)
		if err != nil {
			writeServiceError(w, err)
			return
		}

		body := map[string]any{
			"user_id":    result.UserID,
			"expires_at": result.ExpiresAt,
		}
		if result.DevOnlyCode != "" {
			body["dev_only_code"] = result.DevOnlyCode
		}
		writeJSON(w, http.StatusAccepted, body)
	}
}

type otpVerifyRequest struct {
	Channel string `json:"channel"`
	Contact string `json:"contact"`
	Code    string `json:"code"`
}

func verifyOTPHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req otpVerifyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			problem.BadRequest(w, "invalid_json", err.Error())
			return
		}

		session, err := svc.VerifyOTP(r.Context(), Channel(req.Channel), req.Contact, req.Code)
		if err != nil {
			writeServiceError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"access_token": session.Token,
			"token_type":   "Bearer",
			"expires_at":   session.ExpiresAt,
		})
	}
}

func meHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFromContext(r.Context())
		if !ok {
			problem.Unauthorized(w, "no authenticated user")
			return
		}
		writeJSON(w, http.StatusOK, userResponse(user))
	}
}

func userResponse(u User) map[string]any {
	return map[string]any{
		"id":                 u.ID,
		"account_kind":       u.AccountKind,
		"display_name":       u.DisplayName,
		"verification_state": u.VerificationState,
		"region_code":        u.RegionCode,
		"practice_area":      u.PracticeArea,
		"created_at":         u.CreatedAt,
		"version":            u.Version,
	}
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		problem.NotFound(w, err.Error())
	case errors.Is(err, ErrAlreadyExists):
		problem.Conflict(w, "already_exists", err.Error())
	case errors.Is(err, ErrInvalidCredentials):
		problem.BadRequest(w, "invalid_credentials", err.Error())
	case errors.Is(err, ErrTooManyAttempts):
		problem.Write(w, http.StatusTooManyRequests, "too_many_attempts", "Too many attempts", err.Error())
	case errors.Is(err, ErrSessionInvalid):
		problem.Unauthorized(w, err.Error())
	default:
		problem.Internal(w, "an unexpected error occurred")
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
