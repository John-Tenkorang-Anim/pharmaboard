package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/admin"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/community"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/messaging"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/notices"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/sync"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/workspace"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/changelog"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/config"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/httpserver"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/idempotency"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/pg"
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
		return serve(ctx, cfg)
	case "worker":
		return runWorker(ctx, cfg)
	case "migrate":
		return errors.New("migration runner is intentionally not implemented; use `make migrate` (psql) locally or the pinned migration job in CI")
	default:
		return fmt.Errorf("unknown command %q; expected serve, worker, or migrate", args[0])
	}
}

// modules bundles the services shared between the API and worker
// composition roots so wiring stays in one place.
type modules struct {
	identity  *identity.Service
	notices   *notices.Service
	admin     *admin.Service
	sync      *sync.Service
	messaging *messaging.Service
	community *community.Service
}

func wire(pool *pgxpool.Pool, cfg config.Config) modules {
	identityRepo := identity.NewPostgresRepository(pool)
	var otp identity.OTPProvider
	if cfg.OTPProvider == "twilio" {
		otp = identity.NewTwilioVerify(cfg.TwilioAccountSID, cfg.TwilioAuthToken, cfg.TwilioVerifyServiceSID)
	}
	identitySvc := identity.NewService(identityRepo, cfg.Environment, otp)

	noticesRepo := notices.NewPostgresRepository(pool)
	noticesSvc := notices.NewService(noticesRepo, identitySvc)

	adminRepo := admin.NewPostgresRepository(pool)
	adminSvc := admin.NewService(adminRepo, identitySvc, cfg.AdminBootstrapToken)

	syncSvc := sync.NewService(pool)

	messagingRepo := messaging.NewPostgresRepository(pool)
	messagingSvc := messaging.NewService(messagingRepo, identitySvc)

	communityRepo := community.NewPostgresRepository(pool)
	communitySvc := community.NewService(communityRepo, identitySvc)

	return modules{
		identity:  identitySvc,
		notices:   noticesSvc,
		admin:     adminSvc,
		sync:      syncSvc,
		messaging: messagingSvc,
		community: communitySvc,
	}
}

func serve(ctx context.Context, cfg config.Config) error {
	pool, err := pg.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()

	mods := wire(pool, cfg)
	auth := identity.RequireAuth(mods.identity)

	router := chi.NewRouter()
	router.Mount("/auth", identity.Routes(mods.identity))
	router.Mount("/notices", notices.Routes(mods.notices, auth))
	router.Mount("/admin", admin.Routes(mods.admin, auth))
	router.Mount("/sync", sync.Routes(mods.sync, auth))
	router.Mount("/messaging", messaging.Routes(mods.messaging, auth))
	router.Mount("/community", community.Routes(mods.community, auth))
	router.Mount("/workspace", workspace.Routes(pool, auth))
	router.Mount("/users", identity.DirectoryRoutes(mods.identity, auth))

	slog.Info("pharmaboard API composed", "routes", []string{
		"/v1/auth", "/v1/users", "/v1/notices", "/v1/admin", "/v1/sync", "/v1/messaging", "/v1/community", "/v1/workspace",
	})
	return httpserver.Run(ctx, cfg, router, pool.Ping)
}

func runWorker(ctx context.Context, cfg config.Config) error {
	pool, err := pg.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()

	noticesRepo := notices.NewPostgresRepository(pool)
	dispatcher := notices.NewDispatcher(pool, noticesRepo, map[notices.DeliveryChannel]notices.Provider{
		notices.ChannelPush: notices.NewDevProvider(),
	})

	slog.Info("pharmaboard worker started")

	done := make(chan struct{})
	go func() {
		defer close(done)
		dispatcher.Run(ctx, time.Second)
	}()

	go runWatermarkPublisher(ctx, pool)
	go runIdempotencyJanitor(ctx, pool)

	<-done
	return nil
}

// runWatermarkPublisher implements the short write barrier from
// docs/technical-design.md section 10: it periodically waits for in-flight
// writers and records the true maximum committed sequence as a safe cursor
// for sync clients.
func runWatermarkPublisher(ctx context.Context, pool *pgxpool.Pool) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := changelog.PublishWatermark(ctx, pool); err != nil {
				slog.Error("publish sync watermark failed", "error", err)
			}
		}
	}
}

func runIdempotencyJanitor(ctx context.Context, pool *pgxpool.Pool) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := idempotency.Purge(ctx, pool); err != nil {
				slog.Error("purge idempotency keys failed", "error", err)
			}
		}
	}
}
