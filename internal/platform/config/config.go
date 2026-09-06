package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Environment         string
	HTTPAddr            string
	DatabaseURL         string
	LogLevel            string
	AdminBootstrapToken string
	// AllowedOrigins is a comma-separated CORS allowlist, required in
	// production; ignored in development, where Origin is reflected
	// instead so the local web console can run on any dev port.
	AllowedOrigins string
}

func Load() (Config, error) {
	cfg := Config{
		Environment:         envOrDefault("PHARMABOARD_ENV", "development"),
		HTTPAddr:            envOrDefault("PHARMABOARD_HTTP_ADDR", ":8080"),
		DatabaseURL:         os.Getenv("PHARMABOARD_DATABASE_URL"),
		LogLevel:            envOrDefault("PHARMABOARD_LOG_LEVEL", "info"),
		AdminBootstrapToken: os.Getenv("PHARMABOARD_ADMIN_BOOTSTRAP_TOKEN"),
		AllowedOrigins:      os.Getenv("PHARMABOARD_ALLOWED_ORIGINS"),
	}

	if !strings.HasPrefix(cfg.HTTPAddr, ":") {
		return Config{}, fmt.Errorf("PHARMABOARD_HTTP_ADDR must use :port form")
	}

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
