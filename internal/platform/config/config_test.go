package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	t.Setenv("PHARMABOARD_ENV", "")
	t.Setenv("PHARMABOARD_HTTP_ADDR", "")
	t.Setenv("PHARMABOARD_DATABASE_URL", "")
	t.Setenv("PHARMABOARD_LOG_LEVEL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Environment != "development" || cfg.HTTPAddr != ":8080" {
		t.Fatalf("Load() returned unexpected defaults: %+v", cfg)
	}
}

func TestLoadRejectsInvalidAddress(t *testing.T) {
	t.Setenv("PHARMABOARD_HTTP_ADDR", "localhost:8080")
	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid address error")
	}
}

func TestProductionRequiresSMSProvider(t *testing.T) {
	t.Setenv("PHARMABOARD_ENV", "production")
	t.Setenv("PHARMABOARD_OTP_PROVIDER", "development")
	if _, err := Load(); err == nil {
		t.Fatal("production allowed development OTP")
	}
	t.Setenv("PHARMABOARD_OTP_PROVIDER", "twilio")
	t.Setenv("TWILIO_ACCOUNT_SID", "")
	if _, err := Load(); err == nil {
		t.Fatal("missing credentials accepted")
	}
	t.Setenv("TWILIO_ACCOUNT_SID", "AC00000000000000000000000000000000")
	t.Setenv("TWILIO_AUTH_TOKEN", "test-placeholder")
	t.Setenv("TWILIO_VERIFY_SERVICE_SID", "VA00000000000000000000000000000000")
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
}
