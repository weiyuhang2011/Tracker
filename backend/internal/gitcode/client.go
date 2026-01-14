package gitcode

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	return c.listPaged(ctx, fmt.Sprintf("/api/v5/repos/%s/%s/issues", url.PathEscape(owner), url.PathEscape(repo)))
}

func (c *Client) ListPulls(ctx context.Context, owner, repo string) ([]RemoteItem, error) {
	return c.listPaged(ctx, fmt.Sprintf("/api/v5/repos/%s/%s/pulls", url.PathEscape(owner), url.PathEscape(repo)))
}

func (c *Client) listPaged(ctx context.Context, path string) ([]RemoteItem, error) {
	out := []RemoteItem{}
	for page := 1; page <= 50; page++ { // safety cap
		u, err := url.Parse(c.baseURL + path)
		if err != nil {
			return nil, err
		}
		q := u.Query()
		q.Set("state", "all")
		q.Set("per_page", "100")
		q.Set("page", strconv.Itoa(page))
		u.RawQuery = q.Encode()

		items, err := c.getList(ctx, u.String())
		if err != nil {
			return nil, err
		}
		if len(items) == 0 {
			break
		}
		out = append(out, items...)
	}
	return out, nil
}

func (c *Client) getList(ctx context.Context, fullURL string) ([]RemoteItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}

	// GitCode 文档支持 Authorization: Bearer 和 PRIVATE-TOKEN。
	// 这里优先用 Bearer，同时也填 PRIVATE-TOKEN 以兼容不同部署。
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("PRIVATE-TOKEN", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("gitcode %s: status=%d body=%s", fullURL, res.StatusCode, strings.TrimSpace(string(body)))
	}

	var raw []map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
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
