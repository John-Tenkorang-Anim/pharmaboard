package identity

import (
	"context"

	"github.com/google/uuid"
)

// Profile is the public view of a member — what another user is allowed to
// see. It deliberately excludes contact details (phone, email): the
// directory is for finding colleagues, not for harvesting their numbers
// (docs/technical-design.md section 12, "scraping professional directory").
type Profile struct {
	Institution       *string `json:"institution"`
	ID                uuid.UUID
	DisplayName       string
	AccountKind       AccountKind
	VerificationState VerificationState
	PracticeArea      *string
	RegionCode        *string
	CouncilRegNo      *string
}

// ProfileOf projects a User into its public Profile. The registration number
// is shown only for members whose verification currently stands — a revoked
// badge must not keep displaying a Council number as if it were live.
func ProfileOf(u User) Profile {
	p := Profile{
		ID:                u.ID,
		DisplayName:       u.DisplayName,
		AccountKind:       u.AccountKind,
		VerificationState: u.VerificationState,
		PracticeArea:      u.PracticeArea,
		RegionCode:        u.RegionCode,
	}
	if u.VerificationState == VerificationVerified {
		p.CouncilRegNo = u.CouncilRegNo
	}
	return p
}

// ProfileSource is the interface other modules depend on to turn author IDs
// into displayable people. community uses it to hydrate feed and forum
// authors without ever reading the users table itself.
type ProfileSource interface {
	ProfilesByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]Profile, error)
}

// DirectoryQuery bounds a directory search. Limit is capped by the service,
// not the caller: unbounded pagination is the scraping vector called out in
// the threat model.
type DirectoryQuery struct {
	Search       string
	RegionCode   string
	PracticeArea string
	After        uuid.UUID
	Limit        int
}
