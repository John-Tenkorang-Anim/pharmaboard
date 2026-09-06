package notices_test

// These are integration tests against a real PostgreSQL database, as
// required by docs/technical-design.md section 18 ("Integration: real
// PostgreSQL; constraints, locking, idempotency, retries"). They exercise
// the two highest-value invariants named in that section:
//
//  1. A published notice's audience_size always equals its immutable
//     recipient count.
//  2. Repeated execution, timeouts, and crashes never lose a recipient or
//     create an unbounded duplicate send.
//
// Set PHARMABOARD_TEST_DATABASE_URL to a scratch database to run these;
// they are skipped otherwise so `go test ./...` stays hermetic by default.
// `make test-integration` sets it to the local dev database started by
// `make up`.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/notices"
)

// uniquePhone returns a phone number unique to this process run, so tests
// can run repeatedly against a persistent (non-truncated) dev database
// without colliding on the users.phone_e164 uniqueness constraint.
func uniquePhone() string {
	return "+233" + strings.ReplaceAll(uuid.NewString(), "-", "")[:9]
}

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("PHARMABOARD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("PHARMABOARD_TEST_DATABASE_URL not set; skipping integration test")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// mustCreateVerifiedUser creates a verified user scoped to practiceArea.
// Tests use a unique practiceArea per run (see newTestAudience) and target
// it directly instead of "all verified users", so a shared, non-empty dev
// database never pollutes the expected count.
func mustCreateVerifiedUser(t *testing.T, pool *pgxpool.Pool, phone, practiceArea string) uuid.UUID {
	t.Helper()
	repo := identity.NewPostgresRepository(pool)
	svc := identity.NewService(repo, "test")
	user, err := svc.Register(context.Background(), identity.RegisterInput{
		AccountKind:  identity.AccountKindPharmacist,
		DisplayName:  "Test User",
		PhoneE164:    &phone,
		PracticeArea: &practiceArea,
	})
	if err != nil {
		t.Fatalf("register user: %v", err)
	}
	if err := svc.Verify(context.Background(), user.ID, "PC-TEST", user.ID, "test_harness", "integration test"); err != nil {
		t.Fatalf("verify user: %v", err)
	}
	return user.ID
}

func mustCreateUnverifiedUser(t *testing.T, pool *pgxpool.Pool, phone, practiceArea string) uuid.UUID {
	t.Helper()
	repo := identity.NewPostgresRepository(pool)
	svc := identity.NewService(repo, "test")
	user, err := svc.Register(context.Background(), identity.RegisterInput{
		AccountKind:  identity.AccountKindPharmacist,
		DisplayName:  "Unverified User",
		PhoneE164:    &phone,
		PracticeArea: &practiceArea,
	})
	if err != nil {
		t.Fatalf("register user: %v", err)
	}
	return user.ID
}

// newTestAudience returns a practice_area value unique to this test run, so
// AudienceRule{PracticeArea: &area} matches exactly the users this test
// created regardless of what else is in the database.
func newTestAudience() string {
	return "test-" + uuid.NewString()
}

// publishedNotice drives a fresh notice through draft -> in_review ->
// approved -> published and returns its final state.
func publishedNotice(t *testing.T, ctx context.Context, svc *notices.Service, authorID, approverID uuid.UUID, practiceArea string) notices.Notice {
	t.Helper()

	n, err := svc.CreateDraft(ctx, notices.DraftInput{
		PublisherID:  authorID,
		Title:        "Integration test notice",
		BodyMarkdown: "body",
		Severity:     notices.SeverityCritical,
		AudienceRule: identity.AudienceRule{PracticeArea: &practiceArea},
	})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if err := svc.Submit(ctx, n.ID, n.Version); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if err := svc.Approve(ctx, n.ID, approverID, n.Version+1); err != nil {
		t.Fatalf("approve: %v", err)
	}
	published, err := svc.Publish(ctx, n.ID, n.Version+2, authorID)
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	return published
}

func countRecipients(t *testing.T, pool *pgxpool.Pool, noticeID uuid.UUID) int {
	t.Helper()
	var count int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM notice_recipients WHERE notice_id = $1`, noticeID).Scan(&count); err != nil {
		t.Fatalf("count recipients: %v", err)
	}
	return count
}

// TestPublish_AudienceSizeMatchesFrozenRecipientCount is invariant #1 from
// docs/technical-design.md section 18.
func TestPublish_AudienceSizeMatchesFrozenRecipientCount(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	area := newTestAudience()

	authorID := mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	approverID := mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	// Three more verified recipients plus one unverified user who must be
	// excluded from the frozen audience.
	mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	mustCreateUnverifiedUser(t, pool, uniquePhone(), area)

	identitySvc := identity.NewService(identity.NewPostgresRepository(pool), "test")
	noticesSvc := notices.NewService(notices.NewPostgresRepository(pool), identitySvc)

	published := publishedNotice(t, ctx, noticesSvc, authorID, approverID, area)

	if published.AudienceSize == nil {
		t.Fatal("audience_size is nil after publish")
	}
	// author + approver + 3 recipients = 5 verified users at publish time.
	const wantAudience = 5
	if *published.AudienceSize != wantAudience {
		t.Fatalf("audience_size = %d, want %d", *published.AudienceSize, wantAudience)
	}

	got := countRecipients(t, pool, published.ID)
	if got != wantAudience {
		t.Fatalf("frozen recipient rows = %d, want %d (must equal audience_size)", got, wantAudience)
	}
	if got != *published.AudienceSize {
		t.Fatalf("recipient count (%d) diverged from stored audience_size (%d)", got, *published.AudienceSize)
	}
}

// TestPublish_CannotDoublePublish is invariant #2 from docs/technical-
// design.md section 18: a retried publish (stale version, as a crashed
// client would send) must never re-freeze the audience or enqueue a second
// dispatch job.
func TestPublish_CannotDoublePublish(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	area := newTestAudience()

	authorID := mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	approverID := mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	mustCreateVerifiedUser(t, pool, uniquePhone(), area)

	identitySvc := identity.NewService(identity.NewPostgresRepository(pool), "test")
	noticesSvc := notices.NewService(notices.NewPostgresRepository(pool), identitySvc)

	published := publishedNotice(t, ctx, noticesSvc, authorID, approverID, area)
	firstCount := countRecipients(t, pool, published.ID)

	// Simulate a retried request replaying the pre-publish version.
	_, err := noticesSvc.Publish(ctx, published.ID, published.Version-1, authorID)
	if err == nil {
		t.Fatal("expected version conflict on retried publish, got nil error")
	}

	secondCount := countRecipients(t, pool, published.ID)
	if secondCount != firstCount {
		t.Fatalf("recipient count changed after retried publish: %d -> %d", firstCount, secondCount)
	}

	var outboxJobs int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM outbox_jobs WHERE topic = 'notice.dispatch' AND payload->>'notice_id' = $1`, published.ID.String()).Scan(&outboxJobs); err != nil {
		t.Fatalf("count outbox jobs: %v", err)
	}
	if outboxJobs != 1 {
		t.Fatalf("dispatch jobs enqueued = %d, want exactly 1", outboxJobs)
	}
}

// TestApprove_RejectsSameUserAsAuthor matches docs/technical-design.md
// section 9: "a single account cannot create and approve the same
// high-severity notice."
func TestApprove_RejectsSameUserAsAuthor(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	area := newTestAudience()

	authorID := mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	identitySvc := identity.NewService(identity.NewPostgresRepository(pool), "test")
	noticesSvc := notices.NewService(notices.NewPostgresRepository(pool), identitySvc)

	n, err := noticesSvc.CreateDraft(ctx, notices.DraftInput{
		PublisherID:  authorID,
		Title:        "Self-approval attempt",
		BodyMarkdown: "body",
		Severity:     notices.SeverityCritical,
		AudienceRule: identity.AudienceRule{PracticeArea: &area},
	})
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if err := noticesSvc.Submit(ctx, n.ID, n.Version); err != nil {
		t.Fatalf("submit: %v", err)
	}

	err = noticesSvc.Approve(ctx, n.ID, authorID, n.Version+1)
	if err == nil {
		t.Fatal("expected approval by the author to be rejected")
	}
}

// TestDispatch_RetriesTransientFailureThenSucceeds exercises the retry path
// from docs/technical-design.md section 9 end to end against real Postgres
// row locking (FOR UPDATE SKIP LOCKED claims), using a provider that fails
// once before succeeding.
func TestDispatch_RetriesTransientFailureThenSucceeds(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	area := newTestAudience()

	authorID := mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	approverID := mustCreateVerifiedUser(t, pool, uniquePhone(), area)
	mustCreateVerifiedUser(t, pool, uniquePhone(), area)

	identitySvc := identity.NewService(identity.NewPostgresRepository(pool), "test")
	repo := notices.NewPostgresRepository(pool)
	noticesSvc := notices.NewService(repo, identitySvc)

	published := publishedNotice(t, ctx, noticesSvc, authorID, approverID, area)

	created, err := repo.CreateDeliveryAttempts(ctx, published.ID, notices.ChannelPush)
	if err != nil {
		t.Fatalf("create delivery attempts: %v", err)
	}
	if created != *published.AudienceSize {
		t.Fatalf("delivery attempts created = %d, want %d", created, *published.AudienceSize)
	}

	provider := &flakyOnceProvider{}
	dispatcher := notices.NewDispatcher(pool, repo, map[notices.DeliveryChannel]notices.Provider{
		notices.ChannelPush: provider,
	})

	runCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	done := make(chan struct{})
	go func() {
		dispatcher.Run(runCtx, 20*time.Millisecond)
		close(done)
	}()

	deadline := time.Now().Add(4 * time.Second)
	var report notices.DeliveryReport
	for time.Now().Before(deadline) {
		var err error
		report, err = noticesSvc.DeliveryReport(ctx, published.ID)
		if err != nil {
			t.Fatalf("delivery report: %v", err)
		}
		if report.Delivered == *published.AudienceSize {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	<-done

	if report.Delivered != *published.AudienceSize {
		t.Fatalf("delivered = %d, want %d (retry should have recovered the flaky attempt)", report.Delivered, *published.AudienceSize)
	}
}

// flakyOnceProvider fails the first send for each recipient once, then
// succeeds, proving the retry path actually recovers a transient failure
// instead of merely classifying it.
type flakyOnceProvider struct {
	failed map[uuid.UUID]bool
}

func (p *flakyOnceProvider) Send(_ context.Context, attempt notices.DeliveryAttempt) (string, error) {
	if p.failed == nil {
		p.failed = map[uuid.UUID]bool{}
	}
	if !p.failed[attempt.UserID] {
		p.failed[attempt.UserID] = true
		return "", notices.ErrProviderTransient
	}
	return "ok", nil
}
