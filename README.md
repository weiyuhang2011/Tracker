# Tracker

openYuanRong 开源版本看板（从 GitCode 同步 PR/Issue，并维护自定义字段）。

## 技术选型（为什么是 Vite）

- 你当前的需求是“单页看板 + 调用后端 API”，不需要 SSR/复杂路由；Vite + React 是最省心的入门方案。
- Next.js 更适合需要 SEO/SSR/多页面路由与后端一体化时再引入；后续如果你真的需要再迁移也不晚。

## 本地运行

### 1) 启动后端（Go + SQLite）

在一个终端：

`cd backend && go run ./cmd/server`

默认监听 `:8080`，数据库文件 `./tracker.db`（在 backend 目录下）。

可选环境变量：

- `ADDR`：默认 `:8080`
- `DB_PATH`：默认 `./tracker.db`
- `CORS_ORIGIN`：默认 `http://localhost:5173`

### 2) 启动前端（Vite）

在另一个终端：

`cd web && npm install && npm run dev`

打开：`http://localhost:5173`

### 3) 配置 GitCode 同步

后端通过 `POST /api/sync` 拉取 GitCode 的 issue/PR 并写入本地 SQLite。

配置方式（启动后端前设置环境变量）：

- `GITCODE_TOKEN`：你的 GitCode 个人访问令牌（必填）
- `GITCODE_OWNER`：默认 `openeuler`
- `GITCODE_REPOS`：默认 `yuanrong,yuanrong-functionsystem,yuanrong-datasystem,ray-adapter,yuanrong-frontend`
- `GITCODE_BASE_URL`：默认 `https://api.gitcode.com`

启动后端时示例：

`export GITCODE_TOKEN=xxxx`

然后在页面点“同步”。
