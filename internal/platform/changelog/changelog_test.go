package changelog_test

// Integration test for the safe-watermark barrier described in
// changelog.go and docs/technical-design.md section 10. It reproduces the
// exact bug the barrier exists to prevent: a transaction that allocates an
// earlier sequence number but commits later than a transaction that
// allocated a later one. A naive `SELECT MAX(sequence_no)` watermark would
// expose the later sequence before the earlier one is visible, and a
// client polling with that cursor would skip the earlier row forever once
// it does commit. The barrier must make the watermark wait instead.
//
// Set PHARMABOARD_TEST_DATABASE_URL to run this test; see
// internal/modules/notices/postgres_test.go for the same convention.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/changelog"
)

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

func TestPublishWatermark_WaitsForLateCommittingWriter(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	slowEntityID := uuid.Must(uuid.NewV7())
	fastEntityID := uuid.Must(uuid.NewV7())

	// tx1 allocates a sequence number first but will commit last.
	tx1, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx1: %v", err)
	}
	if err := changelog.Append(ctx, tx1, "test_entity", slowEntityID, "upsert", 1, nil); err != nil {
		t.Fatalf("append in tx1: %v", err)
	}

	// tx2 allocates a later sequence number and commits immediately.
	tx2, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx2: %v", err)
	}
	if err := changelog.Append(ctx, tx2, "test_entity", fastEntityID, "upsert", 1, nil); err != nil {
		t.Fatalf("append in tx2: %v", err)
	}
	if err := tx2.Commit(ctx); err != nil {
		t.Fatalf("commit tx2: %v", err)
	}

	// PublishWatermark must block while tx1 (holding the shared barrier
	// lock) is still open, even though tx2 already committed a higher
	// sequence number.
	watermarkDone := make(chan int64, 1)
	watermarkErr := make(chan error, 1)
	go func() {
		wm, err := changelog.PublishWatermark(ctx, pool)
		if err != nil {
			watermarkErr <- err
			return
		}
		watermarkDone <- wm
	}()

	select {
	case wm := <-watermarkDone:
		t.Fatalf("PublishWatermark returned %d before the in-flight writer committed; the barrier did not block", wm)
	case err := <-watermarkErr:
		t.Fatalf("PublishWatermark failed: %v", err)
	case <-time.After(300 * time.Millisecond):
		// Expected: still blocked on tx1's shared advisory lock.
	}

	if err := tx1.Commit(ctx); err != nil {
		t.Fatalf("commit tx1: %v", err)
	}

	var watermark int64
	select {
	case watermark = <-watermarkDone:
	case err := <-watermarkErr:
		t.Fatalf("PublishWatermark failed: %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("PublishWatermark did not unblock after tx1 committed")
	}

	page, next, err := changelog.Page(ctx, pool, 0, 100)
	if err != nil {
		t.Fatalf("page: %v", err)
	}
	if next != watermark {
		t.Fatalf("page cursor = %d, want the published watermark %d", next, watermark)
	}

	foundSlow, foundFast := false, false
	for _, e := range page {
		if e.EntityID == slowEntityID {
			foundSlow = true
		}
		if e.EntityID == fastEntityID {
			foundFast = true
		}
	}
	if !foundSlow {
		t.Fatal("the late-committing (lower sequence number) entity is missing from the safe page: the client would have skipped it forever")
	}
	if !foundFast {
		t.Fatal("the early-committing (higher sequence number) entity is missing from the safe page")
	}
}
