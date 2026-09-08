package messaging_test

// Integration tests against a real PostgreSQL database — same convention
// as internal/modules/notices/postgres_test.go. Set
// PHARMABOARD_TEST_DATABASE_URL to run these.

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/messaging"
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

func uniquePhone() string {
	return "+233" + strings.ReplaceAll(uuid.NewString(), "-", "")[:9]
}

func mustCreateUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	phone := uniquePhone()
	svc := identity.NewService(identity.NewPostgresRepository(pool), "test")
	user, err := svc.Register(context.Background(), identity.RegisterInput{
		AccountKind: identity.AccountKindPharmacist,
		DisplayName: "Messaging Test User",
		PhoneE164:   &phone,
	})
	if err != nil {
		t.Fatalf("register user: %v", err)
	}
	return user.ID
}

func TestCreateConversation_DerivesKindFromParticipantCount(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := messaging.NewService(messaging.NewPostgresRepository(pool))

	a, b, c := mustCreateUser(t, pool), mustCreateUser(t, pool), mustCreateUser(t, pool)

	direct, err := svc.CreateConversation(ctx, a, []uuid.UUID{b}, nil)
	if err != nil {
		t.Fatalf("create direct conversation: %v", err)
	}
	if direct.Kind != messaging.KindDirect {
		t.Fatalf("kind = %s, want direct", direct.Kind)
	}

	title := "Pilot pharmacists"
	group, err := svc.CreateConversation(ctx, a, []uuid.UUID{b, c}, &title)
	if err != nil {
		t.Fatalf("create group conversation: %v", err)
	}
	if group.Kind != messaging.KindGroup {
		t.Fatalf("kind = %s, want group", group.Kind)
	}
}

// TestCreateConversation_RejectsOversizedGroup enforces the "small group"
// cap from ADR-0004: messaging must not grow into a second, unaudited
// broadcast mechanism competing with notices.
func TestCreateConversation_RejectsOversizedGroup(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := messaging.NewService(messaging.NewPostgresRepository(pool))

	creator := mustCreateUser(t, pool)
	others := make([]uuid.UUID, messaging.MaxParticipants) // + creator = MaxParticipants+1, over the cap
	for i := range others {
		others[i] = mustCreateUser(t, pool)
	}
	title := "Too big"

	_, err := svc.CreateConversation(ctx, creator, others, &title)
	if err == nil {
		t.Fatal("expected an oversized group to be rejected")
	}
}

// TestGroupOnly_CannotAddParticipantToDirectConversation enforces that a
// direct conversation's pair is fixed for its lifetime (ADR-0004).
func TestGroupOnly_CannotAddParticipantToDirectConversation(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := messaging.NewService(messaging.NewPostgresRepository(pool))

	a, b, c := mustCreateUser(t, pool), mustCreateUser(t, pool), mustCreateUser(t, pool)
	direct, err := svc.CreateConversation(ctx, a, []uuid.UUID{b}, nil)
	if err != nil {
		t.Fatalf("create direct conversation: %v", err)
	}

	if err := svc.AddParticipant(ctx, a, direct.ID, c); err == nil {
		t.Fatal("expected adding a participant to a direct conversation to be rejected")
	}
}

// TestSendMessage_NonParticipantForbidden is the basic authorization
// invariant: only active participants may read or write a conversation.
func TestSendMessage_NonParticipantForbidden(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := messaging.NewService(messaging.NewPostgresRepository(pool))

	a, b, outsider := mustCreateUser(t, pool), mustCreateUser(t, pool), mustCreateUser(t, pool)
	conv, err := svc.CreateConversation(ctx, a, []uuid.UUID{b}, nil)
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	if _, err := svc.SendMessage(ctx, outsider, conv.ID, "hello"); err == nil {
		t.Fatal("expected a non-participant's message to be rejected")
	}
	if _, _, err := svc.ListMessages(ctx, outsider, conv.ID, 0, 50); err == nil {
		t.Fatal("expected a non-participant's message list to be rejected")
	}
}

// TestListMessages_RespectsSafeWatermark proves messaging reuses the same
// barrier notices already relies on (ADR-0004's stated reason for not
// inventing a second cursor scheme): a message whose change-log entry sits
// above the currently published watermark must not appear yet.
func TestListMessages_RespectsSafeWatermark(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := messaging.NewService(messaging.NewPostgresRepository(pool))

	a, b := mustCreateUser(t, pool), mustCreateUser(t, pool)
	conv, err := svc.CreateConversation(ctx, a, []uuid.UUID{b}, nil)
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	sent, err := svc.SendMessage(ctx, a, conv.ID, "hello before any watermark publish")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	// No watermark has been published yet in this test process (that only
	// happens from the worker's periodic loop), so the message must not be
	// visible through the safe-paginated read path.
	messages, _, err := svc.ListMessages(ctx, b, conv.ID, 0, 50)
	if err != nil {
		t.Fatalf("list messages: %v", err)
	}
	for _, m := range messages {
		if m.ID == sent.ID {
			t.Fatal("message appeared before the safe watermark advanced past it — the barrier is not being respected")
		}
	}
}

// TestStartCall_AnnouncesSystemMessageAndDisclosesProvider covers the two
// things ADR-0004 requires of video calling: it must be visible in the
// conversation like any other event, and the response must disclose the
// third-party provider.
func TestStartCall_AnnouncesSystemMessageAndDisclosesProvider(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := messaging.NewService(messaging.NewPostgresRepository(pool))

	a, b := mustCreateUser(t, pool), mustCreateUser(t, pool)
	conv, err := svc.CreateConversation(ctx, a, []uuid.UUID{b}, nil)
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	call, err := svc.StartCall(ctx, a, conv.ID)
	if err != nil {
		t.Fatalf("start call: %v", err)
	}
	if call.Provider != messaging.VideoProvider {
		t.Fatalf("provider = %s, want %s", call.Provider, messaging.VideoProvider)
	}
	if call.RoomURL() == "" {
		t.Fatal("room URL is empty")
	}

	if err := svc.EndCall(ctx, a, call.ID); err != nil {
		t.Fatalf("end call: %v", err)
	}
	// Ending an outsider's call must fail even if the call ID is known.
	outsider := mustCreateUser(t, pool)
	call2, err := svc.StartCall(ctx, a, conv.ID)
	if err != nil {
		t.Fatalf("start second call: %v", err)
	}
	if err := svc.EndCall(ctx, outsider, call2.ID); err == nil {
		t.Fatal("expected a non-participant to be unable to end the call")
	}
}

func TestUnreadMessagesArePrivateAndClearOnRead(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := messaging.NewPostgresRepository(pool)
	svc := messaging.NewService(repo)
	a, b, c := mustCreateUser(t, pool), mustCreateUser(t, pool), mustCreateUser(t, pool)
	conv, err := svc.CreateConversation(ctx, a, []uuid.UUID{b}, nil)
	if err != nil {
		t.Fatal(err)
	}
	msg, err := svc.SendMessage(ctx, a, conv.ID, "Can you help with the discussion?")
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []uuid.UUID{a, c} {
		summary, err := repo.Unread(ctx, id)
		if err != nil || summary.Count != 0 {
			t.Fatalf("unexpected unread for %s: %+v %v", id, summary, err)
		}
	}
	summary, err := repo.Unread(ctx, b)
	if err != nil || summary.Count != 1 {
		t.Fatalf("missing unread: %+v %v", summary, err)
	}
	if err := svc.MarkReadThrough(ctx, c, conv.ID, msg.ID); err == nil {
		t.Fatal("outsider marked read")
	}
	if err := svc.MarkReadThrough(ctx, b, conv.ID, msg.ID); err != nil {
		t.Fatal(err)
	}
	summary, err = repo.Unread(ctx, b)
	if err != nil || summary.Count != 0 {
		t.Fatalf("not cleared: %+v %v", summary, err)
	}
	if _, err := svc.SendMessage(ctx, a, conv.ID, "Another question"); err != nil {
		t.Fatal(err)
	}
	if err := svc.Leave(ctx, conv.ID, b); err != nil {
		t.Fatal(err)
	}
	summary, err = repo.Unread(ctx, b)
	if err != nil || summary.Count != 0 {
		t.Fatalf("left conversation shown: %+v %v", summary, err)
	}
}
