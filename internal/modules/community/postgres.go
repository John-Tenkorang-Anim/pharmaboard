package community

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

var _ Repository = (*PostgresRepository)(nil)

// subjectTable maps a reaction subject to the table carrying its counter.
// Values are from a closed set (SubjectType.Valid), never caller input, so
// this cannot become dynamic SQL from user data.
func subjectTable(s SubjectType) (string, error) {
	switch s {
	case SubjectPost:
		return "posts", nil
	case SubjectThread:
		return "forum_threads", nil
	case SubjectReply:
		return "forum_replies", nil
	default:
		return "", fmt.Errorf("%w: unknown subject type %q", ErrValidation, s)
	}
}

// --- posts / feed ----------------------------------------------------------

const postColumns = `id, author_id, body, reaction_count, created_at, hidden_at`

func scanPost(row pgx.Row) (Post, error) {
	var p Post
	err := row.Scan(&p.ID, &p.AuthorID, &p.Body, &p.ReactionCount, &p.CreatedAt, &p.HiddenAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Post{}, ErrNotFound
	}
	if err != nil {
		return Post{}, fmt.Errorf("community: scan post: %w", err)
	}
	return p, nil
}

func (r *PostgresRepository) CreatePost(ctx context.Context, p Post) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO posts (id, author_id, body) VALUES ($1, $2, $3)`,
		p.ID, p.AuthorID, p.Body)
	if err != nil {
		return fmt.Errorf("community: create post: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetPost(ctx context.Context, id uuid.UUID) (Post, error) {
	return scanPost(r.pool.QueryRow(ctx, "SELECT "+postColumns+" FROM posts WHERE id = $1", id))
}

// beforeClause turns an optional UUIDv7 cursor into "strictly older than".
// UUIDv7 sorts chronologically, so id < cursor is "posted earlier".
func beforeClause(before uuid.UUID, args []any) (string, []any) {
	if before == uuid.Nil {
		return "", args
	}
	args = append(args, before)
	return fmt.Sprintf(" AND p.id < $%d", len(args)), args
}

const aliasedPostColumns = `p.id, p.author_id, p.body, p.reaction_count, p.created_at, p.hidden_at`

func (r *PostgresRepository) FeedPage(ctx context.Context, followingOf *uuid.UUID, before uuid.UUID, limit int) ([]Post, error) {
	var args []any
	query := "SELECT " + aliasedPostColumns + " FROM posts p WHERE p.hidden_at IS NULL"

	if followingOf != nil {
		args = append(args, *followingOf)
		query += fmt.Sprintf(`
			AND (p.author_id = $%d OR p.author_id IN (
				SELECT followee_id FROM follows WHERE follower_id = $%d))`, len(args), len(args))
	}

	clause, args := beforeClause(before, args)
	query += clause

	args = append(args, limit)
	query += fmt.Sprintf(" ORDER BY p.id DESC LIMIT $%d", len(args))

	return r.queryPosts(ctx, query, args...)
}

func (r *PostgresRepository) PostsByAuthor(ctx context.Context, authorID uuid.UUID, before uuid.UUID, limit int) ([]Post, error) {
	args := []any{authorID}
	query := "SELECT " + aliasedPostColumns +
		" FROM posts p WHERE p.hidden_at IS NULL AND p.author_id = $1"
	clause, args := beforeClause(before, args)
	query += clause
	args = append(args, limit)
	query += fmt.Sprintf(" ORDER BY p.id DESC LIMIT $%d", len(args))

	return r.queryPosts(ctx, query, args...)
}

func (r *PostgresRepository) queryPosts(ctx context.Context, query string, args ...any) ([]Post, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("community: query posts: %w", err)
	}
	defer rows.Close()

	posts := []Post{}
	for rows.Next() {
		p, err := scanPost(rows)
		if err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

// --- follows ---------------------------------------------------------------

func (r *PostgresRepository) Follow(ctx context.Context, followerID, followeeID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, followerID, followeeID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23514" {
			return ErrSelfFollow
		}
		return fmt.Errorf("community: follow: %w", err)
	}
	return nil
}

func (r *PostgresRepository) Unfollow(ctx context.Context, followerID, followeeID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, followerID, followeeID)
	if err != nil {
		return fmt.Errorf("community: unfollow: %w", err)
	}
	return nil
}

func (r *PostgresRepository) FollowingIDs(ctx context.Context, followerID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, `SELECT followee_id FROM follows WHERE follower_id = $1`, followerID)
	if err != nil {
		return nil, fmt.Errorf("community: following ids: %w", err)
	}
	defer rows.Close()

	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("community: scan following id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *PostgresRepository) Stats(ctx context.Context, userID uuid.UUID) (ProfileStats, error) {
	var s ProfileStats
	err := r.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM posts WHERE author_id = $1 AND hidden_at IS NULL),
			(SELECT COUNT(*) FROM follows WHERE followee_id = $1),
			(SELECT COUNT(*) FROM follows WHERE follower_id = $1)`,
		userID,
	).Scan(&s.Posts, &s.Followers, &s.Following)
	if err != nil {
		return ProfileStats{}, fmt.Errorf("community: stats: %w", err)
	}
	return s, nil
}

// --- reactions -------------------------------------------------------------

func (r *PostgresRepository) React(ctx context.Context, subject SubjectType, subjectID, userID uuid.UUID) error {
	table, err := subjectTable(subject)
	if err != nil {
		return err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("community: begin react: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		INSERT INTO reactions (subject_type, subject_id, user_id)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		string(subject), subjectID, userID)
	if err != nil {
		return fmt.Errorf("community: react: %w", err)
	}
	// Only move the counter when a row was actually inserted, so a repeated
	// react is a true no-op rather than silent counter inflation.
	if tag.RowsAffected() == 1 {
		if _, err := tx.Exec(ctx,
			"UPDATE "+table+" SET reaction_count = reaction_count + 1 WHERE id = $1", subjectID); err != nil {
			return fmt.Errorf("community: increment reaction count: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func (r *PostgresRepository) Unreact(ctx context.Context, subject SubjectType, subjectID, userID uuid.UUID) error {
	table, err := subjectTable(subject)
	if err != nil {
		return err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("community: begin unreact: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		DELETE FROM reactions
		WHERE subject_type = $1 AND subject_id = $2 AND user_id = $3`,
		string(subject), subjectID, userID)
	if err != nil {
		return fmt.Errorf("community: unreact: %w", err)
	}
	if tag.RowsAffected() == 1 {
		if _, err := tx.Exec(ctx,
			"UPDATE "+table+" SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = $1", subjectID); err != nil {
			return fmt.Errorf("community: decrement reaction count: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func (r *PostgresRepository) ReactedSubjects(ctx context.Context, subject SubjectType, ids []uuid.UUID, userID uuid.UUID) (map[uuid.UUID]bool, error) {
	reacted := map[uuid.UUID]bool{}
	if len(ids) == 0 {
		return reacted, nil
	}

	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = id.String()
	}

	rows, err := r.pool.Query(ctx, `
		SELECT subject_id FROM reactions
		WHERE subject_type = $1 AND user_id = $2 AND subject_id = ANY($3::uuid[])`,
		string(subject), userID, keys)
	if err != nil {
		return nil, fmt.Errorf("community: reacted subjects: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("community: scan reacted subject: %w", err)
		}
		reacted[id] = true
	}
	return reacted, rows.Err()
}

// --- forum -----------------------------------------------------------------

const threadColumns = `id, author_id, title, body, tags, accepted_reply_id,
	reply_count, reaction_count, created_at, last_activity_at, hidden_at`

func scanThread(row pgx.Row) (ForumThread, error) {
	var t ForumThread
	err := row.Scan(&t.ID, &t.AuthorID, &t.Title, &t.Body, &t.Tags, &t.AcceptedReplyID,
		&t.ReplyCount, &t.ReactionCount, &t.CreatedAt, &t.LastActivityAt, &t.HiddenAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ForumThread{}, ErrNotFound
	}
	if err != nil {
		return ForumThread{}, fmt.Errorf("community: scan thread: %w", err)
	}
	return t, nil
}

func (r *PostgresRepository) CreateThread(ctx context.Context, t ForumThread) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO forum_threads (id, author_id, title, body, tags)
		VALUES ($1, $2, $3, $4, $5)`,
		t.ID, t.AuthorID, t.Title, t.Body, t.Tags)
	if err != nil {
		return fmt.Errorf("community: create thread: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetThread(ctx context.Context, id uuid.UUID) (ForumThread, error) {
	return scanThread(r.pool.QueryRow(ctx, "SELECT "+threadColumns+" FROM forum_threads WHERE id = $1", id))
}

func (r *PostgresRepository) ThreadPage(ctx context.Context, search string, offset, limit int) ([]ForumThread, error) {
	args := []any{limit, offset}
	query := "SELECT " + threadColumns + " FROM forum_threads WHERE hidden_at IS NULL"

	if search != "" {
		args = append(args, search)
		// Authorization is not a factor here (all forum content is visible to
		// members), but search still runs against the stored tsvector rather
		// than a LIKE scan — see forum_threads_search_idx.
		query += fmt.Sprintf(" AND search_document @@ plainto_tsquery('english', $%d)", len(args))
	}

	query += " ORDER BY last_activity_at DESC LIMIT $1 OFFSET $2"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("community: thread page: %w", err)
	}
	defer rows.Close()

	threads := []ForumThread{}
	for rows.Next() {
		t, err := scanThread(rows)
		if err != nil {
			return nil, err
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

func (r *PostgresRepository) CreateReply(ctx context.Context, reply ForumReply) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("community: begin create reply: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		INSERT INTO forum_replies (id, thread_id, author_id, body)
		VALUES ($1, $2, $3, $4)`,
		reply.ID, reply.ThreadID, reply.AuthorID, reply.Body,
	); err != nil {
		return fmt.Errorf("community: create reply: %w", err)
	}

	// Counter and activity timestamp move in the same transaction as the
	// reply, so the forum index can never show a stale count.
	if _, err := tx.Exec(ctx, `
		UPDATE forum_threads
		SET reply_count = reply_count + 1, last_activity_at = now()
		WHERE id = $1`, reply.ThreadID,
	); err != nil {
		return fmt.Errorf("community: bump thread activity: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) RepliesForThread(ctx context.Context, threadID uuid.UUID) ([]ForumReply, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, thread_id, author_id, body, reaction_count, created_at, hidden_at
		FROM forum_replies WHERE thread_id = $1 AND hidden_at IS NULL ORDER BY id`, threadID)
	if err != nil {
		return nil, fmt.Errorf("community: replies for thread: %w", err)
	}
	defer rows.Close()

	replies := []ForumReply{}
	for rows.Next() {
		var reply ForumReply
		if err := rows.Scan(&reply.ID, &reply.ThreadID, &reply.AuthorID, &reply.Body,
			&reply.ReactionCount, &reply.CreatedAt, &reply.HiddenAt); err != nil {
			return nil, fmt.Errorf("community: scan reply: %w", err)
		}
		replies = append(replies, reply)
	}
	return replies, rows.Err()
}

// AcceptReply marks a reply as the accepted answer. Only the thread's author
// may do so, enforced in the UPDATE itself so the check cannot be skipped by
// a caller that forgot it.
func (r *PostgresRepository) AcceptReply(ctx context.Context, threadID, replyID, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE forum_threads
		SET accepted_reply_id = $2
		WHERE id = $1
		  AND author_id = $3
		  AND EXISTS (SELECT 1 FROM forum_replies WHERE id = $2 AND thread_id = $1)`,
		threadID, replyID, actorID)
	if err != nil {
		return fmt.Errorf("community: accept reply: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrForbidden
	}
	return nil
}

// --- moderation ------------------------------------------------------------

func (r *PostgresRepository) CreateReport(ctx context.Context, report Report) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO content_reports (id, subject_type, subject_id, reporter_id, reason)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (subject_type, subject_id, reporter_id) DO NOTHING`,
		report.ID, string(report.SubjectType), report.SubjectID, report.ReporterID, report.Reason)
	if err != nil {
		return fmt.Errorf("community: create report: %w", err)
	}
	return nil
}

func (r *PostgresRepository) Hide(ctx context.Context, subject SubjectType, subjectID uuid.UUID, reason string) error {
	table, err := subjectTable(subject)
	if err != nil {
		return err
	}
	tag, err := r.pool.Exec(ctx,
		"UPDATE "+table+" SET hidden_at = now(), hidden_reason = $2 WHERE id = $1", subjectID, reason)
	if err != nil {
		return fmt.Errorf("community: hide: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
