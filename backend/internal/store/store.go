package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Store struct {
	db *sql.DB
}

func New(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Migrate(ctx context.Context) error {
	stmts := []string{
		`PRAGMA journal_mode=WAL;`,
		`CREATE TABLE IF NOT EXISTS items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			kind TEXT NOT NULL,                 -- issue|pr
			repo_full_name TEXT NOT NULL,        -- owner/repo
			external_key TEXT NOT NULL,          -- issue/pr number (string)
			title TEXT NOT NULL,
			state TEXT NOT NULL,
			url TEXT NOT NULL,
			author TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,

			assignee TEXT NOT NULL DEFAULT '',
			assignee_group TEXT NOT NULL DEFAULT '',
			note TEXT NOT NULL DEFAULT '',
			estimated_resolve_at TEXT NOT NULL DEFAULT '',
			sync_internal INTEGER NOT NULL DEFAULT 0,
			priority INTEGER NOT NULL DEFAULT 0,
			due_at TEXT NOT NULL DEFAULT '',

			UNIQUE(kind, repo_full_name, external_key)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);`,
		`CREATE INDEX IF NOT EXISTS idx_items_repo ON items(repo_full_name);`,
		`CREATE INDEX IF NOT EXISTS idx_items_due ON items(due_at);`,
	}

	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("migrate exec: %w", err)
		}
	}
	return nil
}

type Item struct {
	Kind          string `json:"kind"`
	RepoFullName  string `json:"repoFullName"`
	ExternalKey   string `json:"key"`
	Title         string `json:"title"`
	State         string `json:"state"`
	URL           string `json:"url"`
	Author        string `json:"author"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
	Assignee      string `json:"assignee"`
	AssigneeGroup string `json:"assigneeGroup"`
	Note          string `json:"note"`
	EstimatedAt   string `json:"estimatedResolveAt"`
	SyncInternal  bool   `json:"syncInternal"`
	Priority      int    `json:"priority"`
	DueAt         string `json:"dueAt"`
	OverdueDays   int    `json:"overdueDays"`
}

type ListFilter struct {
	Kind         string
	RepoFullName string
}

func (s *Store) ListItems(ctx context.Context, f ListFilter) ([]Item, error) {
	where := []string{"1=1"}
	args := []any{}

	if f.Kind != "" {
		where = append(where, "kind = ?")
		args = append(args, f.Kind)
	}
	if f.RepoFullName != "" {
		where = append(where, "repo_full_name = ?")
		args = append(args, f.RepoFullName)
	}

	q := `SELECT kind, repo_full_name, external_key, title, state, url, author, created_at, updated_at,
		assignee, assignee_group, note, estimated_resolve_at, sync_internal, priority, due_at
		FROM items
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY due_at DESC, updated_at DESC;`

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Item{}
	for rows.Next() {
		var it Item
		var syncInt int
		if err := rows.Scan(
			&it.Kind, &it.RepoFullName, &it.ExternalKey, &it.Title, &it.State, &it.URL, &it.Author, &it.CreatedAt, &it.UpdatedAt,
			&it.Assignee, &it.AssigneeGroup, &it.Note, &it.EstimatedAt, &syncInt, &it.Priority, &it.DueAt,
		); err != nil {
			return nil, err
		}
		it.SyncInternal = syncInt != 0
		it.OverdueDays = computeOverdueDays(it.DueAt)
		items = append(items, it)
	}
	return items, rows.Err()
}

type CustomPatch struct {
	Assignee           *string `json:"assignee"`
	AssigneeGroup      *string `json:"assigneeGroup"`
	Note               *string `json:"note"`
	EstimatedResolveAt *string `json:"estimatedResolveAt"`
	SyncInternal       *bool   `json:"syncInternal"`
	Priority           *int    `json:"priority"`
	DueAt              *string `json:"dueAt"`
}

var errNotFound = errors.New("not found")

func IsNotFound(err error) bool { return errors.Is(err, errNotFound) }

func (s *Store) PatchCustom(ctx context.Context, kind, repoFullName, externalKey string, p CustomPatch) (Item, error) {
	// Read existing first
	q := `SELECT kind, repo_full_name, external_key, title, state, url, author, created_at, updated_at,
		assignee, assignee_group, note, estimated_resolve_at, sync_internal, priority, due_at
		FROM items WHERE kind = ? AND repo_full_name = ? AND external_key = ? LIMIT 1;`

	var it Item
	var syncInt int
	row := s.db.QueryRowContext(ctx, q, kind, repoFullName, externalKey)
	if err := row.Scan(
		&it.Kind, &it.RepoFullName, &it.ExternalKey, &it.Title, &it.State, &it.URL, &it.Author, &it.CreatedAt, &it.UpdatedAt,
		&it.Assignee, &it.AssigneeGroup, &it.Note, &it.EstimatedAt, &syncInt, &it.Priority, &it.DueAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Item{}, errNotFound
		}
		return Item{}, err
	}
	it.SyncInternal = syncInt != 0

	if p.Assignee != nil {
		it.Assignee = *p.Assignee
	}
	if p.AssigneeGroup != nil {
		it.AssigneeGroup = *p.AssigneeGroup
	}
	if p.Note != nil {
		it.Note = *p.Note
	}
	if p.EstimatedResolveAt != nil {
		it.EstimatedAt = *p.EstimatedResolveAt
	}
	if p.SyncInternal != nil {
		it.SyncInternal = *p.SyncInternal
	}
	if p.Priority != nil {
		it.Priority = *p.Priority
	}
	if p.DueAt != nil {
		it.DueAt = *p.DueAt
	}

	upd := `UPDATE items SET assignee=?, assignee_group=?, note=?, estimated_resolve_at=?, sync_internal=?, priority=?, due_at=?
		WHERE kind=? AND repo_full_name=? AND external_key=?;`
	if _, err := s.db.ExecContext(ctx, upd,
		it.Assignee, it.AssigneeGroup, it.Note, it.EstimatedAt, boolToInt(it.SyncInternal), it.Priority, it.DueAt,
		it.Kind, it.RepoFullName, it.ExternalKey,
	); err != nil {
		return Item{}, err
	}

	it.OverdueDays = computeOverdueDays(it.DueAt)
	return it, nil
}

type CoreItem struct {
	Kind         string
	RepoFullName string
	ExternalKey  string
	Title        string
	State        string
	URL          string
	Author       string
	CreatedAt    string
	UpdatedAt    string
}

func (s *Store) UpsertCore(ctx context.Context, items []CoreItem) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}

	q := `INSERT INTO items(kind, repo_full_name, external_key, title, state, url, author, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(kind, repo_full_name, external_key) DO UPDATE SET
			title=excluded.title,
			state=excluded.state,
			url=excluded.url,
			author=excluded.author,
			created_at=excluded.created_at,
			updated_at=excluded.updated_at;`

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, q)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	count := 0
	for _, it := range items {
		if it.Kind == "" || it.RepoFullName == "" || it.ExternalKey == "" || it.Title == "" {
			continue
		}
		if _, err := stmt.ExecContext(ctx,
			it.Kind, it.RepoFullName, it.ExternalKey, it.Title, it.State, it.URL, it.Author, it.CreatedAt, it.UpdatedAt,
		); err != nil {
			return 0, err
		}
		count++
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return count, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func computeOverdueDays(dueAt string) int {
	if dueAt == "" {
		return 0
	}
	// Expect RFC3339 or yyyy-mm-dd; keep simple and forgiving.
	var t time.Time
	var err error
	if strings.Contains(dueAt, "T") {
		t, err = time.Parse(time.RFC3339, dueAt)
	} else {
		t, err = time.Parse("2006-01-02", dueAt)
	}
	if err != nil {
		return 0
	}

	now := time.Now()
	// If due date has time zone, compare in that location by converting now.
	if t.Location() != nil {
		now = now.In(t.Location())
	}

	// Overdue days counts full days past due date.
	if now.Before(t) {
		return 0
	}
	return int(now.Sub(t).Hours() / 24)
}
