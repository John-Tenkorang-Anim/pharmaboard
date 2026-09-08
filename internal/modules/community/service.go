package community

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
)

type Service struct {
	repo     Repository
	profiles identity.ProfileSource
}

func NewService(repo Repository, profiles identity.ProfileSource) *Service {
	return &Service{repo: repo, profiles: profiles}
}

// hydrateAuthors resolves author IDs to profiles in one batch. Every list
// endpoint goes through this, so a feed of 50 posts costs one profile query
// rather than 50 — the N+1 that would otherwise show up the moment the feed
// has real traffic.
func (s *Service) hydrateAuthors(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]identity.Profile, error) {
	if len(ids) == 0 {
		return map[uuid.UUID]identity.Profile{}, nil
	}
	seen := make(map[uuid.UUID]bool, len(ids))
	unique := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	return s.profiles.ProfilesByIDs(ctx, unique)
}

// --- feed ------------------------------------------------------------------

func (s *Service) CreatePost(ctx context.Context, authorID uuid.UUID, body string, channelID *uuid.UUID) (FeedPost, error) {
	body = strings.TrimSpace(body)
	if body == "" || len(body) > MaxPostLength {
		return FeedPost{}, fmt.Errorf("%w: a post must be 1-%d characters", ErrValidation, MaxPostLength)
	}
	if err := s.validateChannel(ctx, channelID); err != nil {
		return FeedPost{}, err
	}

	post := Post{ID: uuid.Must(uuid.NewV7()), AuthorID: authorID, ChannelID: channelID, Body: body}
	if err := s.repo.CreatePost(ctx, post); err != nil {
		return FeedPost{}, err
	}

	stored, err := s.repo.GetPost(ctx, post.ID)
	if err != nil {
		return FeedPost{}, err
	}
	authors, err := s.hydrateAuthors(ctx, []uuid.UUID{authorID})
	if err != nil {
		return FeedPost{}, err
	}
	return FeedPost{Post: stored, Author: authors[authorID]}, nil
}

type FeedScope string

const (
	// ScopeEveryone is the default: chronological, all visible posts. A new
	// member with no follows still sees an active community rather than an
	// empty page.
	ScopeEveryone  FeedScope = "everyone"
	ScopeFollowing FeedScope = "following"
)

func (s *Service) Feed(ctx context.Context, viewerID uuid.UUID, scope FeedScope, channelID *uuid.UUID, before uuid.UUID, limit int, search ...string) ([]FeedPost, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	var followingOf *uuid.UUID
	if scope == ScopeFollowing {
		followingOf = &viewerID
	}

	q := ""
	if len(search) > 0 {
		q = strings.TrimSpace(search[0])
	}
	if len(q) > 200 {
		return nil, ErrValidation
	}
	posts, err := s.repo.FeedPage(ctx, followingOf, channelID, before, limit, q)
	if err != nil {
		return nil, err
	}
	return s.decoratePosts(ctx, viewerID, posts)
}

func (s *Service) PostsByAuthor(ctx context.Context, viewerID, authorID uuid.UUID, before uuid.UUID, limit int) ([]FeedPost, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	posts, err := s.repo.PostsByAuthor(ctx, authorID, before, limit)
	if err != nil {
		return nil, err
	}
	return s.decoratePosts(ctx, viewerID, posts)
}

func (s *Service) decoratePosts(ctx context.Context, viewerID uuid.UUID, posts []Post) ([]FeedPost, error) {
	ids := make([]uuid.UUID, len(posts))
	authorIDs := make([]uuid.UUID, len(posts))
	for i, p := range posts {
		ids[i] = p.ID
		authorIDs[i] = p.AuthorID
	}

	authors, err := s.hydrateAuthors(ctx, authorIDs)
	if err != nil {
		return nil, err
	}
	reacted, err := s.repo.ReactedSubjects(ctx, SubjectPost, ids, viewerID)
	if err != nil {
		return nil, err
	}
	following, err := s.repo.FollowingIDs(ctx, viewerID)
	if err != nil {
		return nil, err
	}
	followSet := make(map[uuid.UUID]bool, len(following))
	for _, id := range following {
		followSet[id] = true
	}

	out := make([]FeedPost, len(posts))
	for i, p := range posts {
		out[i] = FeedPost{
			Post:          p,
			Author:        authors[p.AuthorID],
			ViewerReacted: reacted[p.ID],
			ViewerFollows: followSet[p.AuthorID],
		}
	}
	return out, nil
}

// --- follows ---------------------------------------------------------------

func (s *Service) Follow(ctx context.Context, followerID, followeeID uuid.UUID) error {
	if followerID == followeeID {
		return ErrSelfFollow
	}
	return s.repo.Follow(ctx, followerID, followeeID)
}

func (s *Service) Unfollow(ctx context.Context, followerID, followeeID uuid.UUID) error {
	return s.repo.Unfollow(ctx, followerID, followeeID)
}

// ProfileView is a member's profile page: who they are, their counted
// context, whether the viewer follows them, and their recent posts.
type ProfileView struct {
	Profile       identity.Profile
	Stats         ProfileStats
	ViewerFollows bool
	IsSelf        bool
	Posts         []FeedPost
}

func (s *Service) ProfileView(ctx context.Context, viewerID, subjectID uuid.UUID) (ProfileView, error) {
	profiles, err := s.profiles.ProfilesByIDs(ctx, []uuid.UUID{subjectID})
	if err != nil {
		return ProfileView{}, err
	}
	profile, ok := profiles[subjectID]
	if !ok {
		return ProfileView{}, ErrNotFound
	}

	stats, err := s.repo.Stats(ctx, subjectID)
	if err != nil {
		return ProfileView{}, err
	}
	posts, err := s.PostsByAuthor(ctx, viewerID, subjectID, uuid.Nil, 25)
	if err != nil {
		return ProfileView{}, err
	}
	following, err := s.repo.FollowingIDs(ctx, viewerID)
	if err != nil {
		return ProfileView{}, err
	}
	follows := false
	for _, id := range following {
		if id == subjectID {
			follows = true
			break
		}
	}

	return ProfileView{
		Profile:       profile,
		Stats:         stats,
		ViewerFollows: follows,
		IsSelf:        viewerID == subjectID,
		Posts:         posts,
	}, nil
}

// --- reactions -------------------------------------------------------------

func (s *Service) SetReaction(ctx context.Context, subject SubjectType, subjectID, userID uuid.UUID, on bool) error {
	if !subject.Valid() {
		return fmt.Errorf("%w: unknown subject type", ErrValidation)
	}
	if on {
		return s.repo.React(ctx, subject, subjectID, userID)
	}
	return s.repo.Unreact(ctx, subject, subjectID, userID)
}

// validateChannel confirms a channel actually exists before letting a post
// or thread be filed under it — the foreign key would catch this too, but
// this way a bad ID reads as an ordinary validation error, not a raw SQL
// failure. A nil channelID (uncategorized) is always valid.
func (s *Service) validateChannel(ctx context.Context, channelID *uuid.UUID) error {
	if channelID == nil {
		return nil
	}
	if _, err := s.repo.ChannelByID(ctx, *channelID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return fmt.Errorf("%w: that channel no longer exists", ErrValidation)
		}
		return err
	}
	return nil
}

// --- forum -----------------------------------------------------------------

func (s *Service) CreateThread(ctx context.Context, authorID uuid.UUID, title, body string, tags []string, channelID *uuid.UUID) (ForumThread, error) {
	title = strings.TrimSpace(title)
	body = strings.TrimSpace(body)
	if len(title) < MinTitleLength || len(title) > MaxTitleLength {
		return ForumThread{}, fmt.Errorf("%w: a title must be %d-%d characters", ErrValidation, MinTitleLength, MaxTitleLength)
	}
	if body == "" || len(body) > MaxThreadBody {
		return ForumThread{}, fmt.Errorf("%w: a question body is required", ErrValidation)
	}
	if len(tags) > MaxTagsPerThread {
		return ForumThread{}, fmt.Errorf("%w: at most %d tags", ErrValidation, MaxTagsPerThread)
	}
	if tags == nil {
		tags = []string{}
	}
	if err := s.validateChannel(ctx, channelID); err != nil {
		return ForumThread{}, err
	}

	thread := ForumThread{
		ID:        uuid.Must(uuid.NewV7()),
		AuthorID:  authorID,
		ChannelID: channelID,
		Title:     title,
		Body:      body,
		Tags:      tags,
	}
	if err := s.repo.CreateThread(ctx, thread); err != nil {
		return ForumThread{}, err
	}
	return s.repo.GetThread(ctx, thread.ID)
}

func (s *Service) Threads(ctx context.Context, viewerID uuid.UUID, search string, channelID *uuid.UUID, page, limit int) ([]ForumThreadView, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	if page < 0 {
		page = 0
	}

	threads, err := s.repo.ThreadPage(ctx, search, channelID, page*limit, limit)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, len(threads))
	authorIDs := make([]uuid.UUID, len(threads))
	for i, t := range threads {
		ids[i] = t.ID
		authorIDs[i] = t.AuthorID
	}
	authors, err := s.hydrateAuthors(ctx, authorIDs)
	if err != nil {
		return nil, err
	}
	reacted, err := s.repo.ReactedSubjects(ctx, SubjectThread, ids, viewerID)
	if err != nil {
		return nil, err
	}

	out := make([]ForumThreadView, len(threads))
	for i, t := range threads {
		out[i] = ForumThreadView{ForumThread: t, Author: authors[t.AuthorID], ViewerReacted: reacted[t.ID]}
	}
	return out, nil
}

// ThreadDetail is a thread with its replies, authors resolved and the
// accepted answer marked.
type ThreadDetail struct {
	Thread  ForumThreadView
	Replies []ForumReplyView
}

func (s *Service) ThreadDetail(ctx context.Context, viewerID, threadID uuid.UUID) (ThreadDetail, error) {
	thread, err := s.repo.GetThread(ctx, threadID)
	if err != nil {
		return ThreadDetail{}, err
	}
	replies, err := s.repo.RepliesForThread(ctx, threadID)
	if err != nil {
		return ThreadDetail{}, err
	}

	authorIDs := []uuid.UUID{thread.AuthorID}
	replyIDs := make([]uuid.UUID, len(replies))
	for i, reply := range replies {
		authorIDs = append(authorIDs, reply.AuthorID)
		replyIDs[i] = reply.ID
	}

	authors, err := s.hydrateAuthors(ctx, authorIDs)
	if err != nil {
		return ThreadDetail{}, err
	}
	threadReacted, err := s.repo.ReactedSubjects(ctx, SubjectThread, []uuid.UUID{thread.ID}, viewerID)
	if err != nil {
		return ThreadDetail{}, err
	}
	replyReacted, err := s.repo.ReactedSubjects(ctx, SubjectReply, replyIDs, viewerID)
	if err != nil {
		return ThreadDetail{}, err
	}

	views := make([]ForumReplyView, len(replies))
	for i, reply := range replies {
		views[i] = ForumReplyView{
			ForumReply:    reply,
			Author:        authors[reply.AuthorID],
			ViewerReacted: replyReacted[reply.ID],
			Accepted:      thread.AcceptedReplyID != nil && *thread.AcceptedReplyID == reply.ID,
		}
	}

	return ThreadDetail{
		Thread: ForumThreadView{
			ForumThread:   thread,
			Author:        authors[thread.AuthorID],
			ViewerReacted: threadReacted[thread.ID],
		},
		Replies: views,
	}, nil
}

func (s *Service) Reply(ctx context.Context, authorID, threadID uuid.UUID, body string) (ForumReply, error) {
	body = strings.TrimSpace(body)
	if body == "" || len(body) > MaxThreadBody {
		return ForumReply{}, fmt.Errorf("%w: a reply body is required", ErrValidation)
	}
	reply := ForumReply{
		ID:       uuid.Must(uuid.NewV7()),
		ThreadID: threadID,
		AuthorID: authorID,
		Body:     body,
	}
	if err := s.repo.CreateReply(ctx, reply); err != nil {
		return ForumReply{}, err
	}
	return reply, nil
}

// AcceptReply records the thread author's explicit choice of answer. Section
// 14: accepted answers are explicit, never inferred from scores.
func (s *Service) AcceptReply(ctx context.Context, actorID, threadID, replyID uuid.UUID) error {
	return s.repo.AcceptReply(ctx, threadID, replyID, actorID)
}

// --- channels ----------------------------------------------------------------

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// slugify turns a channel name into the URL/identifier-safe form the
// database's CHECK constraint requires, so a member typing "Renal Dosing!"
// doesn't need to know slug rules themselves.
func slugify(name string) string {
	lower := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := true // avoids a leading dash
	for _, r := range lower {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case !lastDash:
			b.WriteRune('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (s *Service) CreateChannel(ctx context.Context, createdBy uuid.UUID, name, description string) (Channel, error) {
	name = strings.TrimSpace(name)
	description = strings.TrimSpace(description)
	if len(name) < MinChannelNameLength || len(name) > MaxChannelNameLength {
		return Channel{}, fmt.Errorf("%w: a channel name must be %d-%d characters", ErrValidation, MinChannelNameLength, MaxChannelNameLength)
	}
	if len(description) > MaxChannelDescLength {
		return Channel{}, fmt.Errorf("%w: a description must be at most %d characters", ErrValidation, MaxChannelDescLength)
	}
	slug := slugify(name)
	if !slugPattern.MatchString(slug) {
		return Channel{}, fmt.Errorf("%w: choose a name with at least one letter or number", ErrValidation)
	}

	channel := Channel{
		ID:          uuid.Must(uuid.NewV7()),
		Slug:        slug,
		Name:        name,
		Description: description,
		CreatedBy:   &createdBy,
	}
	if err := s.repo.CreateChannel(ctx, channel); err != nil {
		return Channel{}, err
	}
	// A creator joining their own channel is the natural default — the same
	// expectation as creating a subreddit or an X Community.
	if err := s.repo.JoinChannel(ctx, channel.ID, createdBy); err != nil {
		return Channel{}, err
	}
	return s.repo.ChannelByID(ctx, channel.ID)
}

func (s *Service) Channels(ctx context.Context, viewerID uuid.UUID) ([]ChannelView, error) {
	channels, err := s.repo.ListChannels(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, len(channels))
	for i, c := range channels {
		ids[i] = c.ID
	}
	memberships, err := s.repo.ChannelMemberships(ctx, viewerID, ids)
	if err != nil {
		return nil, err
	}
	views := make([]ChannelView, len(channels))
	for i, c := range channels {
		views[i] = ChannelView{Channel: c, ViewerMember: memberships[c.ID]}
	}
	return views, nil
}

// JoinChannel and LeaveChannel record explicit membership — "communities
// you're part of" — separate from who has posted or started a thread there.
func (s *Service) JoinChannel(ctx context.Context, channelID, userID uuid.UUID) error {
	if err := s.validateChannel(ctx, &channelID); err != nil {
		return err
	}
	return s.repo.JoinChannel(ctx, channelID, userID)
}

func (s *Service) LeaveChannel(ctx context.Context, channelID, userID uuid.UUID) error {
	return s.repo.LeaveChannel(ctx, channelID, userID)
}

// --- moderation ------------------------------------------------------------

func (s *Service) Report(ctx context.Context, reporterID uuid.UUID, subject SubjectType, subjectID uuid.UUID, reason string) error {
	reason = strings.TrimSpace(reason)
	if !subject.Valid() {
		return fmt.Errorf("%w: unknown subject type", ErrValidation)
	}
	if len(reason) < 3 || len(reason) > 500 {
		return fmt.Errorf("%w: a reason of 3-500 characters is required", ErrValidation)
	}
	return s.repo.CreateReport(ctx, Report{
		ID:          uuid.Must(uuid.NewV7()),
		SubjectType: subject,
		SubjectID:   subjectID,
		ReporterID:  reporterID,
		Reason:      reason,
	})
}

func (s *Service) PostDetail(ctx context.Context, viewerID, postID uuid.UUID) (FeedPost, error) {
	p, err := s.repo.GetPost(ctx, postID)
	if err != nil {
		return FeedPost{}, err
	}
	if p.HiddenAt != nil {
		return FeedPost{}, ErrNotFound
	}
	authors, err := s.hydrateAuthors(ctx, []uuid.UUID{p.AuthorID})
	if err != nil {
		return FeedPost{}, err
	}
	reactions, err := s.repo.ReactedSubjects(ctx, SubjectPost, []uuid.UUID{postID}, viewerID)
	if err != nil {
		return FeedPost{}, err
	}
	return FeedPost{Post: p, Author: authors[p.AuthorID], ViewerReacted: reactions[postID]}, nil
}
func (s *Service) Comment(ctx context.Context, actorID, postID, id uuid.UUID, parent *uuid.UUID, body string) error {
	body = strings.TrimSpace(body)
	if body == "" || len(body) > 2000 || id == uuid.Nil {
		return ErrValidation
	}
	return s.repo.CreatePostComment(ctx, PostComment{ID: id, PostID: postID, AuthorID: actorID, ParentID: parent, Body: body})
}
func (s *Service) Comments(ctx context.Context, postID uuid.UUID, page int) ([]PostCommentView, bool, error) {
	p, err := s.repo.GetPost(ctx, postID)
	if err != nil {
		return nil, false, err
	}
	if p.HiddenAt != nil {
		return nil, false, ErrNotFound
	}
	if page < 0 || page > 10000 {
		return nil, false, ErrValidation
	}
	rows, err := s.repo.PostComments(ctx, postID, page*50, 51)
	if err != nil {
		return nil, false, err
	}
	more := len(rows) > 50
	if more {
		rows = rows[:50]
	}
	ids := []uuid.UUID{}
	for _, c := range rows {
		ids = append(ids, c.AuthorID)
	}
	authors, err := s.hydrateAuthors(ctx, ids)
	if err != nil {
		return nil, false, err
	}
	items := make([]PostCommentView, len(rows))
	for i, c := range rows {
		items[i] = PostCommentView{PostComment: c, Author: authors[c.AuthorID]}
	}
	return items, more, nil
}
func (s *Service) DeleteComment(ctx context.Context, actorID, postID, id uuid.UUID) error {
	return s.repo.DeletePostComment(ctx, postID, id, actorID)
}
