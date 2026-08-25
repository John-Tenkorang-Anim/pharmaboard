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
