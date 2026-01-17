package api

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"tracker/internal/gitcode"
	"tracker/internal/store"
)

func RegisterRoutes(r chi.Router, st *store.Store) {
	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":   true,
			"time": time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.Get("/api/items", func(w http.ResponseWriter, req *http.Request) {
		kind := req.URL.Query().Get("kind") // issue|pr|""
		repo := req.URL.Query().Get("repo") // "owner/name" or ""

		items, err := st.ListItems(req.Context(), store.ListFilter{Kind: kind, RepoFullName: repo})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	r.Patch("/api/items/{kind}/{owner}/{repo}/{key}", func(w http.ResponseWriter, req *http.Request) {
		kind := chi.URLParam(req, "kind") // issue|pr
		owner := chi.URLParam(req, "owner")
		repo := chi.URLParam(req, "repo")
		key := chi.URLParam(req, "key") // external key (e.g. number)
		repoFullName := owner + "/" + repo

		var patch store.CustomPatch
		if err := json.NewDecoder(req.Body).Decode(&patch); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
			return
		}

		updated, err := st.PatchCustom(req.Context(), kind, repoFullName, key, patch)
		if err != nil {
			if store.IsNotFound(err) {
				writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
				return
			}
			writeError(w, http.StatusInternalServerError, err)
			return
		}

		writeJSON(w, http.StatusOK, updated)
	})

	r.Post("/api/sync", func(w http.ResponseWriter, req *http.Request) {
		baseURL := envOrDefault("GITCODE_BASE_URL", "https://api.gitcode.com")
		owner := envOrDefault("GITCODE_OWNER", "openeuler")
		reposCSV := envOrDefault("GITCODE_REPOS", "yuanrong,yuanrong-functionsystem,yuanrong-datasystem,ray-adapter,yuanrong-frontend,yuanrong-serve,spring-adapter")
		token := os.Getenv("GITCODE_TOKEN")

		repos := []string{}
		for _, r := range strings.Split(reposCSV, ",") {
			r = strings.TrimSpace(r)
			if r != "" {
				repos = append(repos, r)
			}
		}

		if token == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "missing GITCODE_TOKEN"})
			return
		}

		client := gitcode.NewClient(baseURL, token)

		totalFetched := 0
		totalUpserted := 0
		for _, repo := range repos {
			issues, err := client.ListIssues(req.Context(), owner, repo)
			if err != nil {
				writeError(w, http.StatusBadGateway, err)
				return
			}
			prs, err := client.ListPulls(req.Context(), owner, repo)
			if err != nil {
				writeError(w, http.StatusBadGateway, err)
				return
			}

			core := make([]store.CoreItem, 0, len(issues)+len(prs))
			repoFullName := owner + "/" + repo
			for _, it := range issues {
				core = append(core, store.CoreItem{
					Kind:         "issue",
					RepoFullName: repoFullName,
					ExternalKey:  it.Key,
					Title:        it.Title,
					State:        it.State,
					URL:          it.URL,
					Author:       it.Author,
					CreatedAt:    it.CreatedAt,
					UpdatedAt:    it.UpdatedAt,
				})
			}
			for _, it := range prs {
				core = append(core, store.CoreItem{
					Kind:         "pr",
					RepoFullName: repoFullName,
					ExternalKey:  it.Key,
					Title:        it.Title,
					State:        it.State,
					URL:          it.URL,
					Author:       it.Author,
					CreatedAt:    it.CreatedAt,
					UpdatedAt:    it.UpdatedAt,
				})
			}

			totalFetched += len(core)
			up, err := st.UpsertCore(req.Context(), core)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			totalUpserted += up
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"fetched":  totalFetched,
			"upserted": totalUpserted,
		})
	})
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}
