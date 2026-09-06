package identity

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

type AccountKind string

const (
	AccountKindPharmacist   AccountKind = "pharmacist"
	AccountKindStudent      AccountKind = "student"
	AccountKindOrganisation AccountKind = "organisation"
)

func (k AccountKind) Valid() bool {
	switch k {
	case AccountKindPharmacist, AccountKindStudent, AccountKindOrganisation:
		return true
	}
	return false
}

type VerificationState string

const (
	VerificationUnverified VerificationState = "unverified"
	VerificationPending    VerificationState = "pending"
	VerificationVerified   VerificationState = "verified"
	VerificationRevoked    VerificationState = "revoked"
)

type Channel string

const (
	ChannelPhone Channel = "phone"
	ChannelEmail Channel = "email"
)

// User is the identity module's aggregate root. Other modules never read or
// write the users table directly; they depend on the interfaces this
// package exports (see AudienceSource).
type User struct {
	ID                 uuid.UUID
	AccountKind        AccountKind
	DisplayName        string
	PhoneE164          *string
	Email              *string
	PracticeArea       *string
	RegionCode         *string
	VerificationState  VerificationState
	CouncilRegNo       *string
	VerifiedAt         *time.Time
	CreatedAt          time.Time
	Version            int64
}

func (u User) IsVerified() bool {
	return u.VerificationState == VerificationVerified
}

// AudienceRule is a structured, non-executable targeting rule. It is stored
// as JSONB on notices and evaluated here, inside identity, because only
// identity is authorized to decide who is eligible. Notices imports this
// type (an identity interface, per docs/architecture/module-boundaries.md)
// but never queries the users table itself.
type AudienceRule struct {
	AllVerified  bool    `json:"all_verified"`
	AccountKind  *string `json:"account_kind,omitempty"`
	RegionCode   *string `json:"region_code,omitempty"`
	PracticeArea *string `json:"practice_area,omitempty"`
}

func (r AudienceRule) Validate() error {
	if !r.AllVerified && r.AccountKind == nil && r.RegionCode == nil && r.PracticeArea == nil {
		return errors.New("audience rule must select at least one criterion")
	}
	if r.AccountKind != nil && !AccountKind(*r.AccountKind).Valid() {
		return errors.New("audience rule account_kind is invalid")
	}
	return nil
}

var (
	ErrNotFound          = errors.New("identity: not found")
	ErrAlreadyExists      = errors.New("identity: identifier already registered")
	ErrInvalidCredentials = errors.New("identity: invalid or expired credentials")
	ErrTooManyAttempts    = errors.New("identity: too many attempts")
	ErrSessionInvalid     = errors.New("identity: session invalid or expired")
)
