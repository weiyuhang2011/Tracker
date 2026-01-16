import { Link } from 'react-router-dom'
import type { Item } from '../api'

type RepoStats = {
  repoFullName: string
  issuesTotal: number
  issuesOpen: number
  prsTotal: number
  prsOpen: number
  overdueCount: number
}

function isOpenState(state: string) {
  return state.toLowerCase() === 'open'
}

function pct(open: number, total: number) {
  if (total <= 0) return 0
  return Math.round((open / total) * 100)
}

export function HomePage(props: {
  items: Item[]
  loading: boolean
  onRefresh: () => void
  onSync: () => void
  error: string | null
}) {
  const repoMap = new Map<string, RepoStats>()

  for (const it of props.items) {
    const cur = repoMap.get(it.repoFullName) ?? {
      repoFullName: it.repoFullName,
      issuesTotal: 0,
      issuesOpen: 0,
      prsTotal: 0,
      prsOpen: 0,
      overdueCount: 0,
    }

    if (it.kind === 'issue') {
      cur.issuesTotal += 1
      if (isOpenState(it.state)) cur.issuesOpen += 1
    } else {
      cur.prsTotal += 1
      if (isOpenState(it.state)) cur.prsOpen += 1
    }

    if (it.overdueDays > 0) cur.overdueCount += 1

    repoMap.set(it.repoFullName, cur)
  }

  const repos = Array.from(repoMap.values()).sort((a, b) => a.repoFullName.localeCompare(b.repoFullName))

  return (
    <>
      <div className="container">
        <div className="topbarInner" style={{ padding: '8px 0 0' }}>
          <div className="titleRow">
            <h1>openYuanRong 看板</h1>
            <span className="subtitle">首页：各仓库统计</span>
          </div>
          <div className="actions">
            <button onClick={props.onRefresh} disabled={props.loading}>
              {props.loading ? '刷新中…' : '刷新'}
            </button>
            <button onClick={props.onSync} disabled={props.loading}>
              同步
            </button>
          </div>
        </div>

        {props.error ? <div className="error">{props.error}</div> : null}

        {repos.length === 0 ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 650, marginBottom: 6 }}>还没有数据</div>
            <div className="muted">先配置后端的 GITCODE_TOKEN，然后点击右上角“同步”。</div>
          </div>
        ) : null}

        <div className="grid" style={{ marginTop: 12 }}>
          {repos.map((s) => {
            const issuesPct = pct(s.issuesOpen, s.issuesTotal)
            const prsPct = pct(s.prsOpen, s.prsTotal)

            return (
              <div key={s.repoFullName} className="card">
                <div className="cardHeader">
                  <Link to={`/repo/${encodeURIComponent(s.repoFullName)}`}>{s.repoFullName}</Link>
                  <span className="pill">超期 {s.overdueCount}</span>
                </div>

                <div className="statRow">
                  <div>
                    <div style={{ fontWeight: 650 }}>Issue 未解决</div>
                    <div className="muted">
                      {s.issuesOpen} / {s.issuesTotal}（{issuesPct}%）
                    </div>
                  </div>
                  <div style={{ width: 140 }}>
                    <div className="progress">
                      <div className="progressFill" style={{ width: `${issuesPct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="statRow">
                  <div>
                    <div style={{ fontWeight: 650 }}>PR 未解决</div>
                    <div className="muted">
                      {s.prsOpen} / {s.prsTotal}（{prsPct}%）
                    </div>
                  </div>
                  <div style={{ width: 140 }}>
                    <div className="progress">
                      <div className="progressFill" style={{ width: `${prsPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
