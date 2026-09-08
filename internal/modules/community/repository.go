package community

import (
	"context"

	"github.com/google/uuid"
)

// Repository is the persistence port for the community module.
type Repository interface {
	NetworkIDs(context.Context, uuid.UUID, string, uuid.UUID) ([]NetworkCandidate, error)
	CreatePostComment(context.Context, PostComment) error
	PostComments(context.Context, uuid.UUID, int, int) ([]PostComment, error)
	DeletePostComment(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) error

	CreatePost(ctx context.Context, p Post) error
	GetPost(ctx context.Context, id uuid.UUID) (Post, error)
	// FeedPage returns visible posts newest-first. When followingOf is set,
	// the page is restricted to authors that user follows (plus their own
	// posts) — fan-out on read, per docs/technical-design.md section 20.
	// When channelID is set, the page is further restricted to that
	// community's posts.
	FeedPage(ctx context.Context, followingOf, channelID *uuid.UUID, before uuid.UUID, limit int, search string) ([]Post, error)
	PostsByAuthor(ctx context.Context, authorID uuid.UUID, before uuid.UUID, limit int) ([]Post, error)

	Follow(ctx context.Context, followerID, followeeID uuid.UUID) error
	Unfollow(ctx context.Context, followerID, followeeID uuid.UUID) error
	FollowingIDs(ctx context.Context, followerID uuid.UUID) ([]uuid.UUID, error)
	Stats(ctx context.Context, userID uuid.UUID) (ProfileStats, error)

	// React and Unreact are idempotent desired-state operations. Both keep
	// the denormalized counter on the subject in step within one
	// transaction, and only when a row was actually inserted/removed — see
	// TestReactionCountMatchesRows for the invariant this protects.
	React(ctx context.Context, subject SubjectType, subjectID, userID uuid.UUID) error
	Unreact(ctx context.Context, subject SubjectType, subjectID, userID uuid.UUID) error
	ReactedSubjects(ctx context.Context, subject SubjectType, ids []uuid.UUID, userID uuid.UUID) (map[uuid.UUID]bool, error)

	CreateThread(ctx context.Context, t ForumThread) error
	GetThread(ctx context.Context, id uuid.UUID) (ForumThread, error)
	ThreadPage(ctx context.Context, search string, channelID *uuid.UUID, offset, limit int) ([]ForumThread, error)
	CreateReply(ctx context.Context, r ForumReply) error
	RepliesForThread(ctx context.Context, threadID uuid.UUID) ([]ForumReply, error)
	AcceptReply(ctx context.Context, threadID, replyID, actorID uuid.UUID) error

	// CreateChannel returns ErrAlreadyExists on a slug collision.
	CreateChannel(ctx context.Context, c Channel) error
	ListChannels(ctx context.Context) ([]Channel, error)
	ChannelByID(ctx context.Context, id uuid.UUID) (Channel, error)
	// JoinChannel and LeaveChannel are idempotent desired-state operations,
	// same convention as React/Unreact.
	JoinChannel(ctx context.Context, channelID, userID uuid.UUID) error
	LeaveChannel(ctx context.Context, channelID, userID uuid.UUID) error
	ChannelMemberships(ctx context.Context, userID uuid.UUID, channelIDs []uuid.UUID) (map[uuid.UUID]bool, error)

	CreateReport(ctx context.Context, r Report) error
	Hide(ctx context.Context, subject SubjectType, subjectID uuid.UUID, reason string) error
}
