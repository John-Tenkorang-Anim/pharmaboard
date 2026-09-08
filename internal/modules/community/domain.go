// Package community owns the professional feed, the Rx Forum, follows,
// reactions, and moderation state (docs/technical-design.md sections 8, 14).
//
// Ranking rules that are product decisions, not implementation details:
// the feed is chronological, reactions are unweighted and public, and a
// verified badge is context displayed beside a post — never a multiplier on
// its position. See db/migrations/000004_community.up.sql for the reasoning.
package community

import (
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
)

type SubjectType string

const (
	SubjectPost   SubjectType = "post"
	SubjectThread SubjectType = "thread"
	SubjectReply  SubjectType = "reply"
)

func (s SubjectType) Valid() bool {
	switch s {
	case SubjectPost, SubjectThread, SubjectReply:
		return true
	}
	return false
}

const (
	MaxPostLength        = 4000
	MaxThreadBody        = 8000
	MaxTitleLength       = 200
	MinTitleLength       = 5
	MaxTagsPerThread     = 5
	MinChannelNameLength = 2
	MaxChannelNameLength = 80
	MaxChannelDescLength = 300
)

type Post struct {
	ReplyCount    int
	ID            uuid.UUID
	AuthorID      uuid.UUID
	ChannelID     *uuid.UUID
	Body          string
	ReactionCount int
	CreatedAt     time.Time
	HiddenAt      *time.Time
}

// FeedPost is a post hydrated for display: the author resolved to a real
// person and the viewer's own reaction state resolved, so the client never
// has to issue follow-up requests per row.
type FeedPost struct {
	Post
	Author        identity.Profile
	ViewerReacted bool
	ViewerFollows bool
}

type ForumThread struct {
	ID              uuid.UUID
	AuthorID        uuid.UUID
	ChannelID       *uuid.UUID
	Title           string
	Body            string
	Tags            []string
	AcceptedReplyID *uuid.UUID
	ReplyCount      int
	ReactionCount   int
	CreatedAt       time.Time
	LastActivityAt  time.Time
	HiddenAt        *time.Time
}

// Channel is a member-creatable topic space shared by RxForum threads and
// the main feed's posts — the same role a subreddit, or an X Community,
// plays: a named topic other content is filed under. created_by is nil for
// the handful of starter channels seeded by migration 000014, which no
// member authored. MemberCount reflects explicit joins (channel_members),
// distinct from ThreadCount/PostCount which reflect authored content.
type Channel struct {
	ID          uuid.UUID
	Slug        string
	Name        string
	Description string
	CreatedBy   *uuid.UUID
	ThreadCount int
	PostCount   int
	MemberCount int
	CreatedAt   time.Time
}

// ChannelView is a Channel decorated with the viewer's own relationship to
// it — whether they've joined — the same shape ForumThreadView adds on top
// of ForumThread.
type ChannelView struct {
	Channel
	ViewerMember bool
}

type ForumThreadView struct {
	ForumThread
	Author        identity.Profile
	ViewerReacted bool
}

type ForumReply struct {
	ID            uuid.UUID
	ThreadID      uuid.UUID
	AuthorID      uuid.UUID
	Body          string
	ReactionCount int
	CreatedAt     time.Time
	HiddenAt      *time.Time
}

type ForumReplyView struct {
	ForumReply
	Author        identity.Profile
	ViewerReacted bool
	Accepted      bool
}

type Report struct {
	ID          uuid.UUID
	SubjectType SubjectType
	SubjectID   uuid.UUID
	ReporterID  uuid.UUID
	Reason      string
	State       string
	CreatedAt   time.Time
}

// ProfileStats is the counted context on a member's profile page.
type ProfileStats struct {
	Posts     int
	Followers int
	Following int
}

var (
	ErrNotFound      = errors.New("community: not found")
	ErrValidation    = errors.New("community: validation failed")
	ErrForbidden     = errors.New("community: not permitted")
	ErrSelfFollow    = errors.New("community: a member cannot follow themselves")
	ErrAlreadyExists = errors.New("community: already exists")
)

type PostComment struct {
	ID        uuid.UUID
	PostID    uuid.UUID
	AuthorID  uuid.UUID
	ParentID  *uuid.UUID
	Body      string
	CreatedAt time.Time
	DeletedAt *time.Time
}
type PostCommentView struct {
	PostComment
	Author identity.Profile
}
