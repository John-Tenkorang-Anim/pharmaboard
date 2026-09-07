package identity

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/audit"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

var _ Repository = (*PostgresRepository)(nil)

func (r *PostgresRepository) CreateUser(ctx context.Context, u User) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (id, account_kind, display_name, phone_e164, email, region_code, practice_area, verification_state, institution)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		u.ID, string(u.AccountKind), u.DisplayName, u.PhoneE164, u.Email, u.RegionCode, u.PracticeArea, string(u.VerificationState), u.Institution)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrAlreadyExists
		}
		return fmt.Errorf("identity: create user: %w", err)
	}
	return nil
}

func (r *PostgresRepository) FindByContact(ctx context.Context, channel Channel, value string) (User, error) {
	column := "phone_e164"
	if channel == ChannelEmail {
		column = "email"
	}
	row := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT id, account_kind, display_name, phone_e164, email, practice_area, region_code,
		       verification_state, council_reg_no, verified_at, created_at, version, institution
		FROM users WHERE %s = $1 AND deleted_at IS NULL`, column), value)
	return scanUser(row)
}

func (r *PostgresRepository) FindByID(ctx context.Context, id uuid.UUID) (User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, account_kind, display_name, phone_e164, email, practice_area, region_code,
		       verification_state, council_reg_no, verified_at, created_at, version, institution
		FROM users WHERE id = $1 AND deleted_at IS NULL`, id)
	return scanUser(row)
}

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.AccountKind, &u.DisplayName, &u.PhoneE164, &u.Email, &u.PracticeArea,
		&u.RegionCode, &u.VerificationState, &u.CouncilRegNo, &u.VerifiedAt, &u.CreatedAt, &u.Version, &u.Institution)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("identity: scan user: %w", err)
	}
	return u, nil
}

func (r *PostgresRepository) CreateOTPChallenge(ctx context.Context, id, userID uuid.UUID, channel Channel, codeHash []byte, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO otp_challenges (id, user_id, channel, code_hash, expires_at)
		VALUES ($1, $2, $3, $4, $5)`,
		id, userID, string(channel), codeHash, expiresAt)
	if err != nil {
		return fmt.Errorf("identity: create otp challenge: %w", err)
	}
	return nil
}

// Serialize reservations per user across API replicas before requesting paid SMS.
func (r *PostgresRepository) ReserveExternalOTP(ctx context.Context, id, userID uuid.UUID, channel Channel, codeHash []byte, expiresAt time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var locked uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&locked); err != nil {
		return err
	}
	var recent, hourly int
	if err = tx.QueryRow(ctx, `SELECT count(*) FILTER (WHERE created_at > now()-interval '60 seconds'), count(*) FROM otp_challenges WHERE user_id=$1 AND channel=$2 AND created_at > now()-interval '1 hour'`, userID, channel).Scan(&recent, &hourly); err != nil {
		return err
	}
	if recent > 0 || hourly >= 5 {
		return ErrTooManyAttempts
	}
	if _, err = tx.Exec(ctx, `UPDATE otp_challenges SET consumed_at=now() WHERE user_id=$1 AND channel=$2 AND consumed_at IS NULL`, userID, channel); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO otp_challenges(id,user_id,channel,code_hash,expires_at) VALUES($1,$2,$3,$4,$5)`, id, userID, channel, codeHash, expiresAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ConsumeOTPChallenge atomically finds the newest unconsumed, unexpired
// challenge for the user/channel and marks it consumed if the code matches.
// It returns false without error when no matching challenge exists so the
// caller can distinguish "wrong code" from an infrastructure failure.
func (r *PostgresRepository) ConsumeOTPChallenge(ctx context.Context, userID uuid.UUID, channel Channel, codeHash []byte) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE otp_challenges
		SET consumed_at = now()
		WHERE id = (
			SELECT id FROM otp_challenges
			WHERE user_id = $1 AND channel = $2
			  AND consumed_at IS NULL AND expires_at > now()
			ORDER BY created_at DESC
			LIMIT 1
			FOR UPDATE
		) AND consumed_at IS NULL AND expires_at > now() AND attempts <= 5 AND code_hash=$3`,
		userID, string(channel), codeHash)
	if err != nil {
		return false, fmt.Errorf("identity: consume otp challenge: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (r *PostgresRepository) IncrementOTPAttempts(ctx context.Context, userID uuid.UUID, channel Channel) (int16, error) {
	var attempts int16
	err := r.pool.QueryRow(ctx, `
		UPDATE otp_challenges
		SET attempts = attempts + 1
		WHERE id = (
			SELECT id FROM otp_challenges
			WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL AND expires_at > now()
			ORDER BY created_at DESC LIMIT 1
			FOR UPDATE
		)
		RETURNING attempts`,
		userID, string(channel),
	).Scan(&attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("identity: increment otp attempts: %w", err)
	}
	return attempts, nil
}

func (r *PostgresRepository) CreateSession(ctx context.Context, id, userID uuid.UUID, tokenHash []byte, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO sessions (id, user_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)`,
		id, userID, tokenHash, expiresAt)
	if err != nil {
		return fmt.Errorf("identity: create session: %w", err)
	}
	return nil
}

func (r *PostgresRepository) FindSessionByTokenHash(ctx context.Context, tokenHash []byte) (uuid.UUID, error) {
	var userID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT user_id FROM sessions
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
		tokenHash,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrSessionInvalid
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("identity: find session: %w", err)
	}
	return userID, nil
}

func (r *PostgresRepository) RevokeSession(ctx context.Context, sessionID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE sessions SET revoked_at = now() WHERE id = $1`, sessionID)
	if err != nil {
		return fmt.Errorf("identity: revoke session: %w", err)
	}
	return nil
}

func (r *PostgresRepository) SetVerification(ctx context.Context, userID uuid.UUID, state VerificationState, regNo *string, reviewerID uuid.UUID, evidenceSource, reason string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("identity: begin verification tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE users
		SET verification_state = $2,
		    council_reg_no = COALESCE($3, council_reg_no),
		    verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END,
		    updated_at = now(),
		    version = version + 1
		WHERE id = $1 AND deleted_at IS NULL`,
		userID, string(state), regNo)
	if err != nil {
		return fmt.Errorf("identity: set verification: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	metadata := map[string]any{
		"new_state":       string(state),
		"evidence_source": evidenceSource,
		"reason":          reason,
	}
	if err := audit.Record(ctx, tx, &reviewerID, "identity.verification.updated", "user", &userID, metadata); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("identity: commit verification: %w", err)
	}
	return nil
}

func (r *PostgresRepository) ResolveEligibleUserIDs(ctx context.Context, tx pgx.Tx, rule AudienceRule) ([]uuid.UUID, error) {
	clauses := []string{"deleted_at IS NULL", "verification_state = 'verified'"}
	args := []any{}

	if rule.AccountKind != nil {
		args = append(args, *rule.AccountKind)
		clauses = append(clauses, fmt.Sprintf("account_kind = $%d", len(args)))
	}
	if rule.RegionCode != nil {
		args = append(args, *rule.RegionCode)
		clauses = append(clauses, fmt.Sprintf("region_code = $%d", len(args)))
	}
	if rule.PracticeArea != nil {
		args = append(args, *rule.PracticeArea)
		clauses = append(clauses, fmt.Sprintf("practice_area = $%d", len(args)))
	}

	query := "SELECT id FROM users WHERE " + strings.Join(clauses, " AND ") + " FOR SHARE"
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("identity: resolve eligible users: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("identity: scan eligible user: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("identity: rows: %w", err)
	}
	return ids, nil
}

func (r *PostgresRepository) ProfilesByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]Profile, error) {
	profiles := make(map[uuid.UUID]Profile, len(ids))
	if len(ids) == 0 {
		return profiles, nil
	}

	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = id.String()
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, display_name, account_kind, verification_state, practice_area, region_code, council_reg_no, institution
		FROM users
		WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, keys)
	if err != nil {
		return nil, fmt.Errorf("identity: profiles by ids: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var p Profile
		var state VerificationState
		var regNo *string
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.AccountKind, &state, &p.PracticeArea, &p.RegionCode, &regNo, &p.Institution); err != nil {
			return nil, fmt.Errorf("identity: scan profile: %w", err)
		}
		p.VerificationState = state
		if state == VerificationVerified {
			p.CouncilRegNo = regNo
		}
		profiles[p.ID] = p
	}
	return profiles, rows.Err()
}

func (r *PostgresRepository) SearchDirectory(ctx context.Context, q DirectoryQuery) ([]Profile, error) {
	clauses := []string{"deleted_at IS NULL", "id > $1"}
	args := []any{q.After}

	if q.Search != "" {
		args = append(args, "%"+q.Search+"%")
		clauses = append(clauses, fmt.Sprintf("display_name ILIKE $%d", len(args)))
	}
	if q.RegionCode != "" {
		args = append(args, q.RegionCode)
		clauses = append(clauses, fmt.Sprintf("region_code = $%d", len(args)))
	}
	if q.PracticeArea != "" {
		args = append(args, q.PracticeArea)
		clauses = append(clauses, fmt.Sprintf("practice_area = $%d", len(args)))
	}
	args = append(args, q.Limit)

	query := `
		SELECT id, display_name, account_kind, verification_state, practice_area, region_code, council_reg_no, institution
		FROM users WHERE ` + strings.Join(clauses, " AND ") +
		fmt.Sprintf(" ORDER BY id LIMIT $%d", len(args))

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("identity: search directory: %w", err)
	}
	defer rows.Close()

	profiles := []Profile{}
	for rows.Next() {
		var p Profile
		var state VerificationState
		var regNo *string
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.AccountKind, &state, &p.PracticeArea, &p.RegionCode, &regNo, &p.Institution); err != nil {
			return nil, fmt.Errorf("identity: scan directory row: %w", err)
		}
		p.VerificationState = state
		if state == VerificationVerified {
			p.CouncilRegNo = regNo
		}
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
