package config

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

type Config struct {
	OTPProvider            string
	TwilioAccountSID       string
	TwilioAuthToken        string
	TwilioVerifyServiceSID string
	Environment            string
	HTTPAddr               string
	DatabaseURL            string
	LogLevel               string
	AdminBootstrapToken    string
	// AllowedOrigins is a comma-separated CORS allowlist, required in
	// production; ignored in development, where Origin is reflected
	// instead so the local web console can run on any dev port.
	AllowedOrigins string
}

func Load() (Config, error) {
	cfg := Config{
		OTPProvider:            envOrDefault("PHARMABOARD_OTP_PROVIDER", "development"),
		TwilioAccountSID:       os.Getenv("TWILIO_ACCOUNT_SID"),
		TwilioAuthToken:        os.Getenv("TWILIO_AUTH_TOKEN"),
		TwilioVerifyServiceSID: os.Getenv("TWILIO_VERIFY_SERVICE_SID"),
		Environment:            envOrDefault("PHARMABOARD_ENV", "development"),
		HTTPAddr:               envOrDefault("PHARMABOARD_HTTP_ADDR", ":8080"),
		DatabaseURL:            os.Getenv("PHARMABOARD_DATABASE_URL"),
		LogLevel:               envOrDefault("PHARMABOARD_LOG_LEVEL", "info"),
		AdminBootstrapToken:    os.Getenv("PHARMABOARD_ADMIN_BOOTSTRAP_TOKEN"),
		AllowedOrigins:         os.Getenv("PHARMABOARD_ALLOWED_ORIGINS"),
	}

	if !strings.HasPrefix(cfg.HTTPAddr, ":") {
		return Config{}, fmt.Errorf("PHARMABOARD_HTTP_ADDR must use :port form")
	}

	if cfg.OTPProvider != "development" && cfg.OTPProvider != "twilio" {
		return Config{}, fmt.Errorf("PHARMABOARD_OTP_PROVIDER must be development or twilio")
	}
	if cfg.Environment == "production" && cfg.OTPProvider != "twilio" {
		return Config{}, fmt.Errorf("production requires PHARMABOARD_OTP_PROVIDER=twilio")
	}
	if cfg.OTPProvider == "twilio" {
		if !regexp.MustCompile(`^AC[0-9a-fA-F]{32}$`).MatchString(cfg.TwilioAccountSID) || cfg.TwilioAuthToken == "" || !regexp.MustCompile(`^VA[0-9a-fA-F]{32}$`).MatchString(cfg.TwilioVerifyServiceSID) {
			return Config{}, fmt.Errorf("Twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID")
		}
	}
	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
