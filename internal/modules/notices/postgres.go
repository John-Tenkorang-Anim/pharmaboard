package notices

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/identity"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/audit"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/changelog"
	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/outbox"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

var _ Repository = (*PostgresRepository)(nil)

const noticeColumns = `id, publisher_id, title, body_markdown, severity, state, audience_rule,
	audience_size, approved_by, approved_at, published_at, withdrawn_at, supersedes_id, created_at, version`

func scanNotice(row pgx.Row) (Notice, error) {
	var n Notice
	var ruleBytes []byte
	err := row.Scan(&n.ID, &n.PublisherID, &n.Title, &n.BodyMarkdown, &n.Severity, &n.State, &ruleBytes,
		&n.AudienceSize, &n.ApprovedBy, &n.ApprovedAt, &n.PublishedAt, &n.WithdrawnAt, &n.SupersedesID,
		&n.CreatedAt, &n.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return Notice{}, ErrNotFound
	}
	if err != nil {
		return Notice{}, fmt.Errorf("notices: scan: %w", err)
	}
	if err := json.Unmarshal(ruleBytes, &n.AudienceRule); err != nil {
		return Notice{}, fmt.Errorf("notices: decode audience rule: %w", err)
	}
	return n, nil
}

func (r *PostgresRepository) Create(ctx context.Context, n Notice) error {
	ruleBytes, err := json.Marshal(n.AudienceRule)
	if err != nil {
		return fmt.Errorf("notices: encode audience rule: %w", err)
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO notices (id, publisher_id, title, body_markdown, severity, state, audience_rule)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		n.ID, n.PublisherID, n.Title, n.BodyMarkdown, string(n.Severity), string(n.State), ruleBytes)
	if err != nil {
		return fmt.Errorf("notices: create: %w", err)
	}
	return nil
}

func (r *PostgresRepository) Get(ctx context.Context, id uuid.UUID) (Notice, error) {
	row := r.pool.QueryRow(ctx, "SELECT "+noticeColumns+" FROM notices WHERE id = $1", id)
	return scanNotice(row)
}

func (r *PostgresRepository) List(ctx context.Context, after uuid.UUID, limit int, publishedOnly bool) ([]Notice, error) {
	query := "SELECT " + noticeColumns + " FROM notices WHERE id > $1"
	if publishedOnly {
		query += " AND state = 'published'"
	}
	query += " ORDER BY id LIMIT $2"

	rows, err := r.pool.Query(ctx, query, after, limit)
	if err != nil {
		return nil, fmt.Errorf("notices: list: %w", err)
	}
	defer rows.Close()

	notices := []Notice{}
	for rows.Next() {
		n, err := scanNotice(rows)
		if err != nil {
			return nil, err
		}
		notices = append(notices, n)
	}
	return notices, rows.Err()
}

// lockNotice reads a notice for update inside tx. Every state-transition
// method locks the row first so concurrent requests against the same
// notice serialize instead of racing.
func lockNotice(ctx context.Context, tx pgx.Tx, id uuid.UUID) (Notice, error) {
	row := tx.QueryRow(ctx, "SELECT "+noticeColumns+" FROM notices WHERE id = $1 FOR UPDATE", id)
	return scanNotice(row)
}

func (r *PostgresRepository) Submit(ctx context.Context, id uuid.UUID, expectedVersion int64) error {
	return r.transition(ctx, id, expectedVersion, StateInReview, func(tx pgx.Tx, n Notice) error {
		_, err := tx.Exec(ctx, `UPDATE notices SET state='in_review', updated_at=now(), version=version+1 WHERE id=$1`, id)
		return err
	})
}

func (r *PostgresRepository) RequestChanges(ctx context.Context, id uuid.UUID, expectedVersion int64) error {
	return r.transition(ctx, id, expectedVersion, StateDraft, func(tx pgx.Tx, n Notice) error {
		_, err := tx.Exec(ctx, `UPDATE notices SET state='draft', updated_at=now(), version=version+1 WHERE id=$1`, id)
		return err
	})
}

func (r *PostgresRepository) Approve(ctx context.Context, id, approverID uuid.UUID, expectedVersion int64) error {
	return r.transition(ctx, id, expectedVersion, StateApproved, func(tx pgx.Tx, n Notice) error {
		if approverID == n.PublisherID {
			return ErrApproverIsAuthor
		}
		_, err := tx.Exec(ctx, `
			UPDATE notices SET state='approved', approved_by=$2, approved_at=now(), updated_at=now(), version=version+1
			WHERE id=$1`, id, approverID)
		return err
	})
}

// transition is the shared skeleton for single-step state changes: lock,
// validate the edge and the optimistic-concurrency version, run the
// caller's update, commit.
func (r *PostgresRepository) transition(ctx context.Context, id uuid.UUID, expectedVersion int64, next State, apply func(pgx.Tx, Notice) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("notices: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	n, err := lockNotice(ctx, tx, id)
	if err != nil {
		return err
	}
	if !n.State.CanTransitionTo(next) {
		return fmt.Errorf("%w: cannot move from %s to %s", ErrInvalidState, n.State, next)
	}
	if n.Version != expectedVersion {
		return ErrVersionConflict
	}
	if err := apply(tx, n); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresRepository) Publish(ctx context.Context, audienceSource identity.AudienceSource, id uuid.UUID, expectedVersion int64, publisherID uuid.UUID) (Notice, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Notice{}, fmt.Errorf("notices: begin publish: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	n, err := lockNotice(ctx, tx, id)
	if err != nil {
		return Notice{}, err
	}
	if !n.State.CanTransitionTo(StatePublished) {
		return Notice{}, fmt.Errorf("%w: notice must be approved before publishing", ErrInvalidState)
	}
	if n.Version != expectedVersion {
		return Notice{}, ErrVersionConflict
	}

	// Step 1 of the recipient freeze: identity resolves eligibility inside
	// this same transaction so the audience can never drift between the
	// read and the freeze.
	userIDs, err := audienceSource.ResolveEligibleUserIDs(ctx, tx, n.AudienceRule)
	if err != nil {
		return Notice{}, fmt.Errorf("notices: resolve audience: %w", err)
	}

	recipientIDs := make([]string, len(userIDs))
	for i, userID := range userIDs {
		recipientIDs[i] = userID.String()
	}

	// Step 2: freeze recipients with one set-based insert. notices only
	// ever writes its own notice_recipients table here.
	if _, err := tx.Exec(ctx, `
		INSERT INTO notice_recipients (notice_id, user_id)
		SELECT $1, x::uuid FROM unnest($2::text[]) AS x
		ON CONFLICT (notice_id, user_id) DO NOTHING`,
		id, recipientIDs,
	); err != nil {
		return Notice{}, fmt.Errorf("notices: freeze recipients: %w", err)
	}

	audienceSize := len(recipientIDs)
	ruleHash := canonicalHash(n.AudienceRule)

	newVersion := n.Version + 1
	if _, err := tx.Exec(ctx, `
		UPDATE notices
		SET state='published', audience_size=$2, published_at=now(), updated_at=now(), version=$3
		WHERE id=$1`,
		id, audienceSize, newVersion,
	); err != nil {
		return Notice{}, fmt.Errorf("notices: mark published: %w", err)
	}

	dispatchPayload := map[string]any{"notice_id": id.String()}
	idempotencyKey := fmt.Sprintf("notice-dispatch-%s", id)
	if err := outbox.Enqueue(ctx, tx, "notice.dispatch", dispatchPayload, idempotencyKey); err != nil {
		return Notice{}, err
	}

	auditMetadata := map[string]any{
		"title":              n.Title,
		"severity":           string(n.Severity),
		"audience_size":      audienceSize,
		"audience_rule_hash": ruleHash,
	}
	if err := audit.Record(ctx, tx, &publisherID, "notices.published", "notice", &id, auditMetadata); err != nil {
		return Notice{}, err
	}

	if err := changelog.Append(ctx, tx, "notice", id, "upsert", newVersion, nil); err != nil {
		return Notice{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Notice{}, fmt.Errorf("notices: commit publish: %w", err)
	}

	return r.Get(ctx, id)
}

func canonicalHash(rule identity.AudienceRule) string {
	body, _ := json.Marshal(rule)
	sum := sha256.Sum256(body)
	return fmt.Sprintf("%x", sum)
}

func (r *PostgresRepository) Withdraw(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID, expectedVersion int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("notices: begin withdraw: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	n, err := lockNotice(ctx, tx, id)
	if err != nil {
		return err
	}
	if !n.State.CanTransitionTo(StateWithdrawn) {
		return fmt.Errorf("%w: only a published notice can be withdrawn", ErrInvalidState)
	}
	if n.Version != expectedVersion {
		return ErrVersionConflict
	}

	newVersion := n.Version + 1
	if _, err := tx.Exec(ctx, `
		UPDATE notices SET state='withdrawn', withdrawn_at=now(), updated_at=now(), version=$2
		WHERE id=$1`, id, newVersion); err != nil {
		return fmt.Errorf("notices: mark withdrawn: %w", err)
	}

	if err := audit.Record(ctx, tx, &actorID, "notices.withdrawn", "notice", &id, map[string]any{"reason": reason}); err != nil {
		return err
	}
	if err := changelog.Append(ctx, tx, "notice", id, "upsert", newVersion, nil); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) Acknowledge(ctx context.Context, noticeID, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE notice_recipients
		SET read_at = COALESCE(read_at, now()), acknowledged_at = now()
		WHERE notice_id = $1 AND user_id = $2`, noticeID, userID)
	if err != nil {
		return fmt.Errorf("notices: acknowledge: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) MarkRead(ctx context.Context, noticeID, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE notice_recipients
		SET delivered_at = COALESCE(delivered_at, now()), read_at = COALESCE(read_at, now())
		WHERE notice_id = $1 AND user_id = $2`, noticeID, userID)
	if err != nil {
		return fmt.Errorf("notices: mark read: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) DeliveryReport(ctx context.Context, noticeID uuid.UUID) (DeliveryReport, error) {
	report := DeliveryReport{NoticeID: noticeID}
	var audienceSize *int
	err := r.pool.QueryRow(ctx, `
		SELECT n.audience_size,
		       COUNT(nr.*) FILTER (WHERE nr.delivered_at IS NOT NULL),
		       COUNT(nr.*) FILTER (WHERE nr.read_at IS NOT NULL),
		       COUNT(nr.*) FILTER (WHERE nr.acknowledged_at IS NOT NULL)
		FROM notices n
		LEFT JOIN notice_recipients nr ON nr.notice_id = n.id
		WHERE n.id = $1
		GROUP BY n.audience_size`,
		noticeID,
	).Scan(&audienceSize, &report.Delivered, &report.Read, &report.Acknowledged)
	if errors.Is(err, pgx.ErrNoRows) {
		return DeliveryReport{}, ErrNotFound
	}
	if err != nil {
		return DeliveryReport{}, fmt.Errorf("notices: delivery report: %w", err)
	}
	if audienceSize != nil {
		report.AudienceSize = *audienceSize
	}

	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM delivery_attempts WHERE notice_id = $1 AND state = 'failed'`,
		noticeID,
	).Scan(&report.AttemptsFailed); err != nil {
		return DeliveryReport{}, fmt.Errorf("notices: delivery report failures: %w", err)
	}

	return report, nil
}

func (r *PostgresRepository) CreateDeliveryAttempts(ctx context.Context, noticeID uuid.UUID, channel DeliveryChannel) (int, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO delivery_attempts (id, notice_id, user_id, channel, state, attempt_no)
		SELECT gen_random_uuid(), nr.notice_id, nr.user_id, $2, 'pending', 1
		FROM notice_recipients nr
		WHERE nr.notice_id = $1
		ON CONFLICT (notice_id, user_id, channel, attempt_no) DO NOTHING`,
		noticeID, string(channel))
	if err != nil {
		return 0, fmt.Errorf("notices: create delivery attempts: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

func (r *PostgresRepository) ClaimDeliveryAttempts(ctx context.Context, limit int, leaseSeconds int64) ([]DeliveryAttempt, error) {
	rows, err := r.pool.Query(ctx, `
		UPDATE delivery_attempts
		SET state = 'claimed', claimed_until = now() + make_interval(secs => $2)
		WHERE id IN (
			SELECT id FROM delivery_attempts
			WHERE state IN ('pending', 'retryable') AND available_at <= now()
			ORDER BY available_at, id
			FOR UPDATE SKIP LOCKED
			LIMIT $1
		)
		RETURNING id, notice_id, user_id, channel, attempt_no`,
		limit, leaseSeconds)
	if err != nil {
		return nil, fmt.Errorf("notices: claim delivery attempts: %w", err)
	}
	defer rows.Close()

	var attempts []DeliveryAttempt
	for rows.Next() {
		var a DeliveryAttempt
		if err := rows.Scan(&a.ID, &a.NoticeID, &a.UserID, &a.Channel, &a.AttemptNo); err != nil {
			return nil, fmt.Errorf("notices: scan delivery attempt: %w", err)
		}
		attempts = append(attempts, a)
	}
	return attempts, rows.Err()
}

func (r *PostgresRepository) CompleteDeliveryAttempt(ctx context.Context, attemptID uuid.UUID, providerRef string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("notices: begin complete attempt: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var noticeID, userID uuid.UUID
	err = tx.QueryRow(ctx, `
		UPDATE delivery_attempts
		SET state='delivered', provider_ref=$2, accepted_at=COALESCE(accepted_at, now()), delivered_at=now()
		WHERE id=$1
		RETURNING notice_id, user_id`, attemptID, providerRef,
	).Scan(&noticeID, &userID)
	if err != nil {
		return fmt.Errorf("notices: complete delivery attempt: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE notice_recipients SET delivered_at = COALESCE(delivered_at, now())
		WHERE notice_id = $1 AND user_id = $2`, noticeID, userID); err != nil {
		return fmt.Errorf("notices: update recipient delivered_at: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) RetryOrFailDeliveryAttempt(ctx context.Context, attemptID uuid.UUID, errorCode string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("notices: begin retry attempt: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var noticeID, userID uuid.UUID
	var channel string
	var attemptNo int16
	err = tx.QueryRow(ctx, `
		UPDATE delivery_attempts SET state='failed', last_error_code=$2
		WHERE id=$1
		RETURNING notice_id, user_id, channel, attempt_no`, attemptID, errorCode,
	).Scan(&noticeID, &userID, &channel, &attemptNo)
	if err != nil {
		return fmt.Errorf("notices: fail delivery attempt: %w", err)
	}

	if attemptNo >= MaxDeliveryAttempts {
		// Dead-lettered: the policy retry limit is exhausted.
		return tx.Commit(ctx)
	}

	backoff := backoffWithJitter(attemptNo)
	if _, err := tx.Exec(ctx, `
		INSERT INTO delivery_attempts (id, notice_id, user_id, channel, state, attempt_no, available_at)
		VALUES (gen_random_uuid(), $1, $2, $3, 'retryable', $4, now() + $5)`,
		noticeID, userID, channel, attemptNo+1, backoff,
	); err != nil {
		return fmt.Errorf("notices: schedule retry: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) FailDeliveryAttempt(ctx context.Context, attemptID uuid.UUID, errorCode string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE delivery_attempts SET state='failed', last_error_code=$2 WHERE id=$1`,
		attemptID, errorCode)
	if err != nil {
		return fmt.Errorf("notices: fail delivery attempt permanently: %w", err)
	}
	return nil
}

// backoffWithJitter implements exponential backoff with full jitter, capped
// at two minutes, per docs/technical-design.md section 9.
func backoffWithJitter(attemptNo int16) time.Duration {
	base := time.Duration(1<<attemptNo) * time.Second
	capped := 2 * time.Minute
	if base > capped {
		base = capped
	}
	return time.Duration(rand.Int64N(int64(base) + 1))
}
