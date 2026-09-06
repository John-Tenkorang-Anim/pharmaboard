package notices

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"
)

// ErrProviderTransient marks a failure the worker should retry. Anything
// else is treated as permanent and dead-letters the attempt immediately.
var ErrProviderTransient = errors.New("notices: transient provider failure")

// Provider sends one delivery attempt through a channel. A real
// implementation would call a push/SMS/email vendor; docs/technical-
// design.md section 20 defers that integration until it is measured to be
// needed, so this MVP ships a Provider interface plus a dev simulator.
type Provider interface {
	Send(ctx context.Context, attempt DeliveryAttempt) (providerRef string, err error)
}

// DevProvider simulates provider behavior for local development and tests:
// most sends succeed after a short delay; a configurable fraction fail
// transiently to exercise the retry and dead-letter paths without a real
// SMS/push contract.
type DevProvider struct {
	Latency           time.Duration
	TransientFailRate float64
}

func NewDevProvider() *DevProvider {
	return &DevProvider{Latency: 20 * time.Millisecond, TransientFailRate: 0.1}
}

func (p *DevProvider) Send(ctx context.Context, attempt DeliveryAttempt) (string, error) {
	select {
	case <-time.After(p.Latency):
	case <-ctx.Done():
		return "", ctx.Err()
	}

	if rand.Float64() < p.TransientFailRate {
		return "", fmt.Errorf("%w: simulated provider timeout", ErrProviderTransient)
	}

	return fmt.Sprintf("dev-%s-%d", attempt.ID, attempt.AttemptNo), nil
}
