// Package sync owns offline mutation replay, safe server watermarks, change
// pages, tombstones, and full-resync decisions (docs/technical-design.md
// section 10). This MVP implements the read side: paginating the change
// log up to the latest published watermark. The watermark publisher itself
// lives in internal/platform/changelog and runs from the worker process.
package sync

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/John-Tenkorang-Anim/pharmaboard/internal/platform/changelog"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

type Page struct {
	Entries    []changelog.Entry
	NextCursor int64
}

func (s *Service) Page(ctx context.Context, after int64, limit int) (Page, error) {
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	entries, next, err := changelog.Page(ctx, s.pool, after, limit)
	if err != nil {
		return Page{}, err
	}
	return Page{Entries: entries, NextCursor: next}, nil
}
