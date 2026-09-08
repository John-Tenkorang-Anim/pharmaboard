package community_test

// Integration tests against real PostgreSQL — same convention as the other
// modules. Set PHARMABOARD_TEST_DATABASE_URL to run them.

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/community"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
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

func newService(pool *pgxpool.Pool) *community.Service {
	identitySvc := identity.NewService(identity.NewPostgresRepository(pool), "test")
	return community.NewService(community.NewPostgresRepository(pool), identitySvc)
}

func mustCreateUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	phone := "+233" + strings.ReplaceAll(uuid.NewString(), "-", "")[:9]
	svc := identity.NewService(identity.NewPostgresRepository(pool), "test")
	user, err := svc.Register(context.Background(), identity.RegisterInput{
		AccountKind: identity.AccountKindPharmacist,
		DisplayName: "Community Test User",
		PhoneE164:   &phone,
	})
	if err != nil {
		t.Fatalf("register user: %v", err)
	}
	return user.ID
}

func reactionRows(t *testing.T, pool *pgxpool.Pool, subject string, id uuid.UUID) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM reactions WHERE subject_type = $1 AND subject_id = $2`,
		subject, id).Scan(&n); err != nil {
		t.Fatalf("count reactions: %v", err)
	}
	return n
}

func storedCount(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT reaction_count FROM posts WHERE id = $1`, id).Scan(&n); err != nil {
		t.Fatalf("read stored reaction_count: %v", err)
	}
	return n
}

// TestReactionCountMatchesRows is the invariant that matters in this module.
// reaction_count is denormalized onto the subject to keep the feed a single
// query, which means it can drift from reality if a repeated "react" ever
// increments twice or an absent "unreact" decrements below the truth. The
// counter must only move when a row was genuinely inserted or deleted.
func TestReactionCountMatchesRows(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	author := mustCreateUser(t, pool)
	reactor := mustCreateUser(t, pool)

	post, err := svc.CreatePost(ctx, author, "A post to react to.", nil)
	if err != nil {
		t.Fatalf("create post: %v", err)
	}

	// React three times: the second and third are no-ops.
	for i := 0; i < 3; i++ {
		if err := svc.SetReaction(ctx, community.SubjectPost, post.ID, reactor, true); err != nil {
			t.Fatalf("react %d: %v", i, err)
		}
	}
	if rows, stored := reactionRows(t, pool, "post", post.ID), storedCount(t, pool, post.ID); rows != 1 || stored != 1 {
		t.Fatalf("after 3 identical reacts: rows=%d stored=%d, want 1 and 1 (repeat reactions must not inflate the counter)", rows, stored)
	}

	// Unreact twice: the second is a no-op and must not push the count negative.
	for i := 0; i < 2; i++ {
		if err := svc.SetReaction(ctx, community.SubjectPost, post.ID, reactor, false); err != nil {
			t.Fatalf("unreact %d: %v", i, err)
		}
	}
	if rows, stored := reactionRows(t, pool, "post", post.ID), storedCount(t, pool, post.ID); rows != 0 || stored != 0 {
		t.Fatalf("after 2 unreacts: rows=%d stored=%d, want 0 and 0", rows, stored)
	}
}

// TestFollowingFeedExcludesStrangers checks the fan-out-on-read scoping:
// "following" must mean following, not everyone.
func TestFollowingFeedExcludesStrangers(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	viewer := mustCreateUser(t, pool)
	followed := mustCreateUser(t, pool)
	stranger := mustCreateUser(t, pool)

	followedPost, err := svc.CreatePost(ctx, followed, "From someone the viewer follows.", nil)
	if err != nil {
		t.Fatalf("create followed post: %v", err)
	}
	strangerPost, err := svc.CreatePost(ctx, stranger, "From someone the viewer does not follow.", nil)
	if err != nil {
		t.Fatalf("create stranger post: %v", err)
	}
	if err := svc.Follow(ctx, viewer, followed); err != nil {
		t.Fatalf("follow: %v", err)
	}

	feed, err := svc.Feed(ctx, viewer, community.ScopeFollowing, nil, uuid.Nil, 100)
	if err != nil {
		t.Fatalf("feed: %v", err)
	}

	seen := map[uuid.UUID]bool{}
	for _, p := range feed {
		seen[p.ID] = true
	}
	if !seen[followedPost.ID] {
		t.Error("following feed omitted a followed author's post")
	}
	if seen[strangerPost.ID] {
		t.Error("following feed included a post from an author the viewer does not follow")
	}
}

func TestFollow_RejectsSelfFollow(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	user := mustCreateUser(t, pool)
	if err := svc.Follow(ctx, user, user); err == nil {
		t.Fatal("expected self-follow to be rejected")
	}
}

// TestAcceptReply_OnlyThreadAuthor matches section 14: the accepted answer is
// the asker's explicit choice, so nobody else may set it.
func TestAcceptReply_OnlyThreadAuthor(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	asker := mustCreateUser(t, pool)
	answerer := mustCreateUser(t, pool)

	thread, err := svc.CreateThread(ctx, asker, "How should we store this preparation?",
		"Looking for guidance on storage after reconstitution.", []string{"storage"}, nil)
	if err != nil {
		t.Fatalf("create thread: %v", err)
	}
	reply, err := svc.Reply(ctx, answerer, thread.ID, "Refrigerate and discard after 14 days.")
	if err != nil {
		t.Fatalf("reply: %v", err)
	}

	if err := svc.AcceptReply(ctx, answerer, thread.ID, reply.ID); err == nil {
		t.Fatal("expected a non-author to be unable to accept an answer")
	}
	if err := svc.AcceptReply(ctx, asker, thread.ID, reply.ID); err != nil {
		t.Fatalf("thread author could not accept an answer: %v", err)
	}

	detail, err := svc.ThreadDetail(ctx, asker, thread.ID)
	if err != nil {
		t.Fatalf("thread detail: %v", err)
	}
	if detail.Thread.AcceptedReplyID == nil || *detail.Thread.AcceptedReplyID != reply.ID {
		t.Fatal("accepted reply was not recorded on the thread")
	}
	if len(detail.Replies) != 1 || !detail.Replies[0].Accepted {
		t.Fatal("accepted flag not surfaced on the reply view")
	}
}

// TestReplyCountStaysInStep guards the other denormalized counter.
func TestReplyCountStaysInStep(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	asker := mustCreateUser(t, pool)
	thread, err := svc.CreateThread(ctx, asker, "A question with several answers",
		"Body of the question.", nil, nil)
	if err != nil {
		t.Fatalf("create thread: %v", err)
	}

	for i := 0; i < 3; i++ {
		if _, err := svc.Reply(ctx, asker, thread.ID, "An answer."); err != nil {
			t.Fatalf("reply %d: %v", i, err)
		}
	}

	detail, err := svc.ThreadDetail(ctx, asker, thread.ID)
	if err != nil {
		t.Fatalf("thread detail: %v", err)
	}
	if detail.Thread.ReplyCount != 3 || len(detail.Replies) != 3 {
		t.Fatalf("reply_count=%d, actual replies=%d, want 3 and 3",
			detail.Thread.ReplyCount, len(detail.Replies))
	}
}

func TestPostCommentThreadIntegrity(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)
	author := mustCreateUser(t, pool)
	peer := mustCreateUser(t, pool)
	post, err := svc.CreatePost(ctx, author, "Comment integrity test", nil)
	if err != nil {
		t.Fatal(err)
	}
	other, err := svc.CreatePost(ctx, author, "Other post for isolation test", nil)
	if err != nil {
		t.Fatal(err)
	}
	root := uuid.New()
	child := uuid.New()
	for i := 0; i < 2; i++ {
		if err = svc.Comment(ctx, author, post.ID, root, nil, "A useful perspective"); err != nil {
			t.Fatal(err)
		}
	}
	if err = svc.Comment(ctx, peer, post.ID, root, nil, "Overwrite another author"); err != community.ErrAlreadyExists {
		t.Fatalf("collision: %v", err)
	}
	if err = svc.Comment(ctx, peer, other.ID, uuid.New(), &root, "Cross-post reply"); err != community.ErrValidation {
		t.Fatalf("cross-post parent: %v", err)
	}
	if err = svc.Comment(ctx, peer, post.ID, child, &root, "A response to that perspective"); err != nil {
		t.Fatal(err)
	}
	if err = svc.Comment(ctx, peer, post.ID, uuid.New(), &child, "Unsupported nesting"); err != community.ErrValidation {
		t.Fatalf("nested parent: %v", err)
	}
	detail, err := svc.PostDetail(ctx, peer, post.ID)
	if err != nil || detail.ReplyCount != 2 {
		t.Fatalf("count: %+v %v", detail, err)
	}
	if err = svc.DeleteComment(ctx, peer, post.ID, root); err != community.ErrForbidden {
		t.Fatalf("delete another author: %v", err)
	}
	if err = svc.DeleteComment(ctx, author, post.ID, root); err != nil {
		t.Fatal(err)
	}
	comments, more, err := svc.Comments(ctx, post.ID, 0)
	if err != nil || more || len(comments) != 2 {
		t.Fatalf("comments: %d %v %v", len(comments), more, err)
	}
	if comments[0].Body != "" || comments[0].DeletedAt == nil || comments[1].ParentID == nil {
		t.Fatal("Deleted root must preserve thread shape without revealing its text")
	}
	detail, err = svc.PostDetail(ctx, peer, post.ID)
	if err != nil || detail.ReplyCount != 1 {
		t.Fatal("deleted replies must not count")
	}
	if err = svc.Comment(ctx, author, post.ID, uuid.New(), nil, "   "); err != community.ErrValidation {
		t.Fatal("empty replies must be rejected")
	}
	repo := community.NewPostgresRepository(pool)
	if err = repo.Hide(ctx, community.SubjectPost, post.ID, "test moderation"); err != nil {
		t.Fatal(err)
	}
	if _, _, err = svc.Comments(ctx, post.ID, 0); err != community.ErrNotFound {
		t.Fatal("hidden post comments must not be exposed")
	}
	if err = svc.Comment(ctx, peer, post.ID, uuid.New(), nil, "Reply to hidden post"); err != community.ErrNotFound {
		t.Fatal("hidden posts must not accept replies")
	}
}

func TestNetworkGraphSeparatesFollowingAndRecommendations(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := community.NewPostgresRepository(pool)
	a, b, c, d := mustCreateUser(t, pool), mustCreateUser(t, pool), mustCreateUser(t, pool), mustCreateUser(t, pool)
	defer func() {
		pool.Exec(ctx, `DELETE FROM follows WHERE follower_id=ANY($1) OR followee_id=ANY($1)`, []uuid.UUID{a, b, c, d})
		pool.Exec(ctx, `DELETE FROM users WHERE id=ANY($1)`, []uuid.UUID{a, b, c, d})
	}()
	for _, edge := range [][2]uuid.UUID{{a, b}, {b, c}, {a, d}, {d, c}, {b, a}} {
		if err := repo.Follow(ctx, edge[0], edge[1]); err != nil {
			t.Fatal(err)
		}
	}
	list, err := repo.NetworkIDs(ctx, a, "following", uuid.Nil)
	if err != nil || len(list) != 2 {
		t.Fatalf("following %+v %v", list, err)
	}
	suggestions, err := repo.NetworkIDs(ctx, a, "suggested", uuid.Nil)
	if err != nil || len(suggestions) != 1 || suggestions[0].ID != c || suggestions[0].Mutual != 2 {
		t.Fatalf("suggestions %+v %v", suggestions, err)
	}
	followers, err := repo.NetworkIDs(ctx, a, "followers", uuid.Nil)
	if err != nil || len(followers) != 1 || followers[0].ID != b {
		t.Fatalf("followers %+v %v", followers, err)
	}
	if err := repo.Follow(ctx, a, c); err != nil {
		t.Fatal(err)
	}
	suggestions, err = repo.NetworkIDs(ctx, a, "suggested", uuid.Nil)
	if err != nil || len(suggestions) != 0 {
		t.Fatalf("already followed suggested %+v %v", suggestions, err)
	}
}

// TestChannels_CreateListAndFilter guards the new Reddit-style channels:
// a member-created channel appears in the listing, and a thread posted into
// it is excluded from another channel's filtered page.
func TestChannels_CreateListAndFilter(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	creator := mustCreateUser(t, pool)
	unique := strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	name := "Test Channel " + unique

	channel, err := svc.CreateChannel(ctx, creator, name, "A channel created by a test.")
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}
	if channel.ThreadCount != 0 {
		t.Fatalf("expected a fresh channel to start with no threads, got %d", channel.ThreadCount)
	}

	channels, err := svc.Channels(ctx, creator)
	if err != nil {
		t.Fatalf("list channels: %v", err)
	}
	var found bool
	for _, c := range channels {
		if c.ID == channel.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("newly created channel did not appear in the listing")
	}

	other, err := svc.CreateChannel(ctx, creator, "Other Channel "+unique, "")
	if err != nil {
		t.Fatalf("create other channel: %v", err)
	}

	thread, err := svc.CreateThread(ctx, creator, "A question filed under a channel",
		"Body of the question.", nil, &channel.ID)
	if err != nil {
		t.Fatalf("create thread in channel: %v", err)
	}
	if thread.ChannelID == nil || *thread.ChannelID != channel.ID {
		t.Fatal("thread did not record its channel")
	}

	inChannel, err := svc.Threads(ctx, creator, "", &channel.ID, 0, 20)
	if err != nil {
		t.Fatalf("threads in channel: %v", err)
	}
	var seen bool
	for _, tv := range inChannel {
		if tv.ID == thread.ID {
			seen = true
		}
	}
	if !seen {
		t.Fatal("thread not returned when filtering by its own channel")
	}

	inOther, err := svc.Threads(ctx, creator, "", &other.ID, 0, 20)
	if err != nil {
		t.Fatalf("threads in other channel: %v", err)
	}
	for _, tv := range inOther {
		if tv.ID == thread.ID {
			t.Fatal("thread leaked into an unrelated channel's filtered page")
		}
	}
}

// TestCreateThread_UnknownChannelRejected guards the validation that a
// thread cannot be filed under a channel that does not exist.
func TestCreateThread_UnknownChannelRejected(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	asker := mustCreateUser(t, pool)
	bogus := uuid.New()

	_, err := svc.CreateThread(ctx, asker, "A question with a bad channel",
		"Body of the question.", nil, &bogus)
	if !errors.Is(err, community.ErrValidation) {
		t.Fatalf("expected ErrValidation for an unknown channel, got %v", err)
	}
}

// TestFeed_FilteredByChannel guards the same channel-scoping the forum
// already has, now extended to posts — a "community" in the feed sense.
func TestFeed_FilteredByChannel(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	author := mustCreateUser(t, pool)
	unique := strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	channel, err := svc.CreateChannel(ctx, author, "Feed Channel "+unique, "")
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}

	inChannel, err := svc.CreatePost(ctx, author, "A post inside the channel.", &channel.ID)
	if err != nil {
		t.Fatalf("create post in channel: %v", err)
	}
	outsideChannel, err := svc.CreatePost(ctx, author, "A post outside the channel.", nil)
	if err != nil {
		t.Fatalf("create post outside channel: %v", err)
	}

	filtered, err := svc.Feed(ctx, author, community.ScopeEveryone, &channel.ID, uuid.Nil, 50)
	if err != nil {
		t.Fatalf("filtered feed: %v", err)
	}
	var sawInChannel, sawOutside bool
	for _, p := range filtered {
		if p.ID == inChannel.ID {
			sawInChannel = true
		}
		if p.ID == outsideChannel.ID {
			sawOutside = true
		}
	}
	if !sawInChannel {
		t.Error("channel-filtered feed omitted a post that belongs to the channel")
	}
	if sawOutside {
		t.Error("channel-filtered feed included a post that does not belong to the channel")
	}
}

// TestChannelMembership_JoinLeave guards "communities you're part of":
// joining and leaving are idempotent and reflected in the viewer_member
// state that Channels() decorates each channel with.
func TestChannelMembership_JoinLeave(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := newService(pool)

	creator := mustCreateUser(t, pool)
	member := mustCreateUser(t, pool)
	unique := strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	channel, err := svc.CreateChannel(ctx, creator, "Membership Channel "+unique, "")
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}

	// The creator is auto-joined.
	creatorViews, err := svc.Channels(ctx, creator)
	if err != nil {
		t.Fatalf("channels for creator: %v", err)
	}
	if !viewerMember(creatorViews, channel.ID) {
		t.Fatal("channel creator was not auto-joined as a member")
	}

	memberViews, err := svc.Channels(ctx, member)
	if err != nil {
		t.Fatalf("channels for member: %v", err)
	}
	if viewerMember(memberViews, channel.ID) {
		t.Fatal("a different user was already shown as a member before joining")
	}

	for i := 0; i < 2; i++ {
		if err := svc.JoinChannel(ctx, channel.ID, member); err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
	}
	memberViews, err = svc.Channels(ctx, member)
	if err != nil {
		t.Fatalf("channels after join: %v", err)
	}
	if !viewerMember(memberViews, channel.ID) {
		t.Fatal("member was not reflected as joined after JoinChannel")
	}
	var memberCount int
	for _, c := range memberViews {
		if c.ID == channel.ID {
			memberCount = c.MemberCount
		}
	}
	if memberCount != 2 {
		t.Fatalf("member_count=%d, want 2 (creator + joined member)", memberCount)
	}

	for i := 0; i < 2; i++ {
		if err := svc.LeaveChannel(ctx, channel.ID, member); err != nil {
			t.Fatalf("leave %d: %v", i, err)
		}
	}
	memberViews, err = svc.Channels(ctx, member)
	if err != nil {
		t.Fatalf("channels after leave: %v", err)
	}
	if viewerMember(memberViews, channel.ID) {
		t.Fatal("member was still shown as joined after LeaveChannel")
	}
}

func viewerMember(views []community.ChannelView, id uuid.UUID) bool {
	for _, c := range views {
		if c.ID == id {
			return c.ViewerMember
		}
	}
	return false
}
