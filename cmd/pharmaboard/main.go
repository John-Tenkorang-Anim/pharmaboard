package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/config"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/httpserver"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("pharmaboard stopped", "error", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) != 1 {
		return errors.New("usage: pharmaboard <serve|worker|migrate>")
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch args[0] {
	case "serve":
		return httpserver.Run(ctx, cfg)
	case "worker":
		return errors.New("worker mode is intentionally not implemented before the notice delivery module")
	case "migrate":
		return errors.New("migration runner is intentionally not implemented; use the pinned migration tool in CI")
	default:
		return fmt.Errorf("unknown command %q; expected serve, worker, or migrate", args[0])
	}
}
