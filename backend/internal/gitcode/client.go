package gitcode

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func NewClient(baseURL, token string) *Client {
	baseURL = strings.TrimRight(baseURL, "/")
	return &Client{
		baseURL: baseURL,
		token:   token,
		http: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

type RemoteItem struct {
	Key       string
	Title     string
	State     string
	URL       string
	Author    string
	CreatedAt string
	UpdatedAt string
}

func (c *Client) ListIssues(ctx context.Context, owner, repo string) ([]RemoteItem, error) {
	logger := slog.Default().With("component", "gitcode", "op", "list-issues", "repo", owner+"/"+repo)
	logger.Debug("list issues start")
	return c.listPaged(ctx, fmt.Sprintf("/api/v5/repos/%s/%s/issues", url.PathEscape(owner), url.PathEscape(repo)))
}

func (c *Client) ListPulls(ctx context.Context, owner, repo string) ([]RemoteItem, error) {
	logger := slog.Default().With("component", "gitcode", "op", "list-pulls", "repo", owner+"/"+repo)
	logger.Debug("list pulls start")
	return c.listPaged(ctx, fmt.Sprintf("/api/v5/repos/%s/%s/pulls", url.PathEscape(owner), url.PathEscape(repo)))
}

func (c *Client) listPaged(ctx context.Context, path string) ([]RemoteItem, error) {
	logger := slog.Default().With("component", "gitcode", "op", "list-paged", "path", path)
	start := time.Now()
	out := []RemoteItem{}
	for page := 1; page <= 50; page++ { // safety cap
		u, err := url.Parse(c.baseURL + path)
		if err != nil {
			logger.Error("parse url failed", "err", err)
			return nil, err
		}
		q := u.Query()
		q.Set("state", "all")
		q.Set("per_page", "100")
		q.Set("page", strconv.Itoa(page))
		u.RawQuery = q.Encode()

		items, err := c.getList(ctx, u.String())
		if err != nil {
			logger.Error("request failed", "page", page, "url", u.String(), "err", err)
			return nil, err
		}
		if len(items) == 0 {
			logger.Debug("page empty", "page", page)
			break
		}
		out = append(out, items...)
		logger.Debug("page ok", "page", page, "count", len(items))
	}
	logger.Info("list paged ok", "total", len(out), "elapsed_ms", time.Since(start).Milliseconds())
	return out, nil
}

func (c *Client) getList(ctx context.Context, fullURL string) ([]RemoteItem, error) {
	logger := slog.Default().With("component", "gitcode", "op", "get-list")
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		logger.Error("build request failed", "err", err)
		return nil, err
	}

	// GitCode 文档支持 Authorization: Bearer 和 PRIVATE-TOKEN。
	// 这里优先用 Bearer，同时也填 PRIVATE-TOKEN 以兼容不同部署。
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("PRIVATE-TOKEN", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		logger.Error("http request failed", "url", fullURL, "err", err)
		return nil, err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		logger.Error("non-2xx response", "url", fullURL, "status", res.StatusCode, "body", strings.TrimSpace(string(body)))
		return nil, fmt.Errorf("gitcode %s: status=%d body=%s", fullURL, res.StatusCode, strings.TrimSpace(string(body)))
	}

	var raw []map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		logger.Error("decode list failed", "url", fullURL, "err", err)
		return nil, fmt.Errorf("decode list: %w", err)
	}

	items := make([]RemoteItem, 0, len(raw))
	for _, m := range raw {
		key := firstString(m, "number", "iid", "id")
		if key == "" {
			continue
		}
		title := firstString(m, "title")
		state := firstString(m, "state")
		urlStr := firstString(m, "html_url", "web_url", "url")
		createdAt := firstString(m, "created_at", "createdAt")
		updatedAt := firstString(m, "updated_at", "updatedAt")

		author := ""
		if v, ok := m["user"].(map[string]any); ok {
			author = firstString(v, "login", "username", "name")
		}
		if author == "" {
			if v, ok := m["author"].(map[string]any); ok {
				author = firstString(v, "login", "username", "name")
			}
		}
		if author == "" {
			author = firstString(m, "author")
		}

		items = append(items, RemoteItem{
			Key:       key,
			Title:     title,
			State:     state,
			URL:       urlStr,
			Author:    author,
			CreatedAt: createdAt,
			UpdatedAt: updatedAt,
		})
	}
	logger.Debug("get list ok", "url", fullURL, "count", len(items), "elapsed_ms", time.Since(start).Milliseconds())
	return items, nil
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			s := anyToString(v)
			if s != "" {
				return s
			}
		}
	}
	return ""
}

func anyToString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		// JSON numbers decode as float64
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case json.Number:
		return t.String()
	default:
		return ""
	}
}
