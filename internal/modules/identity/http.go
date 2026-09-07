package identity

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/problem"
)

// Routes mounts the identity module's public HTTP surface: registration and
// the dev-OTP login flow described in service.go. /me requires an
// authenticated session.
func Routes(svc *Service) chi.Router {
	r := chi.NewRouter()
	r.Post("/signup", credentialsHandler(svc, "signup"))
	r.Post("/login", credentialsHandler(svc, "login"))
	r.Post("/google", credentialsHandler(svc, "google"))
	if svc.devMode {
		r.Post("/register", registerHandler(svc))
		r.Post("/otp/request", requestOTPHandler(svc))
		r.Post("/otp/verify", verifyOTPHandler(svc))
	}
	r.With(RequireAuth(svc)).Get("/me", meHandler())
	return r
}

// DirectoryRoutes mounts the member directory. Authenticated only, and
// paginated with a hard cap in the service — see maxDirectoryPage.
func DirectoryRoutes(svc *Service, auth func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Use(auth)
	r.Get("/", searchDirectoryHandler(svc))
	r.Get("/{id}", getProfileHandler(svc))
	return r
}

func searchDirectoryHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		after := uuid.Nil
		if v := r.URL.Query().Get("after"); v != "" {
			parsed, err := uuid.Parse(v)
			if err != nil {
				problem.BadRequest(w, "invalid_cursor", "after must be a UUID")
				return
			}
			after = parsed
		}
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

		profiles, err := svc.SearchDirectory(r.Context(), DirectoryQuery{
			Search:       r.URL.Query().Get("q"),
			RegionCode:   r.URL.Query().Get("region_code"),
			PracticeArea: r.URL.Query().Get("practice_area"),
			After:        after,
			Limit:        limit,
		})
		if err != nil {
			writeServiceError(w, err)
			return
		}

		items := make([]map[string]any, len(profiles))
		var next *uuid.UUID
		for i, p := range profiles {
			items[i] = profileResponse(p)
			id := p.ID
			next = &id
		}
		body := map[string]any{"items": items}
		if next != nil {
			body["next_cursor"] = next
		}
		writeJSON(w, http.StatusOK, body)
	}
}

func getProfileHandler(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			problem.BadRequest(w, "invalid_id", err.Error())
			return
		}
		profile, err := svc.GetProfile(r.Context(), id)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, profileResponse(profile))
	}
}

func profileResponse(p Profile) map[string]any {
	return map[string]any{
		"id":                 p.ID,
		"display_name":       p.DisplayName,
		"account_kind":       p.AccountKind,
		"verification_state": p.VerificationState,
		"practice_area":      p.PracticeArea,
		"institution":        p.Institution,
		"region_code":        p.RegionCode,
		"council_reg_no":     p.CouncilRegNo,
	}
}

type registerRequest struct {
	AccountKind  string  `json:"account_kind"`
	DisplayName  string  `json:"display_name"`
	PhoneE164    *string `json:"phone_e164"`
	Email        *string `json:"email"`
	RegionCode   *string `json:"region_code"`
	Institution  *string `json:"institution"`
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
			Institution:  req.Institution,
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
		"institution":        u.Institution,
		"created_at":         u.CreatedAt,
		"version":            u.Version,
	}
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrOTPUnavailable):
		problem.Write(w, http.StatusServiceUnavailable, "otp_unavailable", "Verification unavailable", err.Error())
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
