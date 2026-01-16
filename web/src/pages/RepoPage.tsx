import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { patchItem, type Item } from '../api'

type Tab = 'issue' | 'pr'

type Editable = Pick<
  Item,
  'assignee' | 'assigneeGroup' | 'note' | 'estimatedResolveAt' | 'syncInternal' | 'priority' | 'dueAt'
>

function isOpenState(state: string) {
  return state.toLowerCase() === 'open'
}

function byTimeDesc(a: Item, b: Item) {
  const aT = a.updatedAt || a.createdAt
  const bT = b.updatedAt || b.createdAt
  return (bT || '').localeCompare(aT || '')
}

export function RepoPage(props: { items: Item[]; onItemUpdated: (it: Item) => void }) {
  const params = useParams()
  const repoFullName = decodeURIComponent(params.repoFullName ?? '')

  const [tab, setTab] = useState<Tab>('issue')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, Editable>>({})

  const repoItems = useMemo(() => {
    return props.items.filter((it) => it.repoFullName === repoFullName)
  }, [props.items, repoFullName])

  const issues = useMemo(() => {
    const all = repoItems.filter((x) => x.kind === 'issue')
    const open = all.filter((x) => isOpenState(x.state)).sort(byTimeDesc)
    const other = all.filter((x) => !isOpenState(x.state)).sort(byTimeDesc)
    return [...open, ...other]
  }, [repoItems])

  const prs = useMemo(() => {
    const all = repoItems.filter((x) => x.kind === 'pr')
    const open = all.filter((x) => isOpenState(x.state)).sort(byTimeDesc)
    const other = all.filter((x) => !isOpenState(x.state)).sort(byTimeDesc)
    return [...open, ...other]
  }, [repoItems])

  function rowKey(it: Item) {
    return `${it.kind}:${it.repoFullName}:${it.key}`
  }

  function getDraft(it: Item): Editable {
    const k = rowKey(it)
    return (
      editing[k] ?? {
        assignee: it.assignee,
        assigneeGroup: it.assigneeGroup,
        note: it.note,
        estimatedResolveAt: it.estimatedResolveAt,
        syncInternal: it.syncInternal,
        priority: it.priority,
        dueAt: it.dueAt,
      }
    )
  }

  function setDraft(it: Item, patch: Partial<Editable>) {
    const k = rowKey(it)
    const current = getDraft(it)
    setEditing((prev) => ({ ...prev, [k]: { ...current, ...patch } }))
  }

  async function save(it: Item) {
    const k = rowKey(it)
    const draft = getDraft(it)
    try {
      setSavingKey(k)
      const updated = await patchItem(it.kind, it.repoFullName, it.key, draft)
      props.onItemUpdated(updated)
      setEditing((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
    } finally {
      setSavingKey(null)
    }
  }

  const list = tab === 'issue' ? issues : prs

  return (
    <div className="container">
      <div className="titleRow" style={{ justifyContent: 'space-between' }}>
        <div className="titleRow">
          <h1>{repoFullName || '仓库'}</h1>
          <span className="subtitle">详情：按 Issue/PR 分类</span>
        </div>
        <div className="actions">
          <Link className="pill" to="/">
            返回首页
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="tabs">
          <button className={tab === 'issue' ? 'tab tabActive' : 'tab'} onClick={() => setTab('issue')}>
            Issue（{issues.length}）
          </button>
          <button className={tab === 'pr' ? 'tab tabActive' : 'tab'} onClick={() => setTab('pr')}>
            PR（{prs.length}）
          </button>
        </div>
        <div className="muted">开放项优先，按更新时间排序</div>
      </div>

      <div style={{ marginTop: 12 }} className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>标题</th>
              <th>状态</th>
              <th>作者</th>
              <th>更新时间</th>
              <th>责任人</th>
              <th>责任组</th>
              <th>备注</th>
              <th>预期解决</th>
              <th>同步内部</th>
              <th>优先级</th>
              <th>到期时间</th>
              <th>超期天数</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((it) => {
              const draft = getDraft(it)
              const overdue = it.overdueDays > 0

              return (
                <tr key={rowKey(it)}>
                  <td>{it.key}</td>
                  <td>
                    <a href={it.url} target="_blank" rel="noreferrer">
                      {it.title}
                    </a>
                  </td>
                  <td>{it.state}</td>
                  <td>{it.author}</td>
                  <td className="muted">{it.updatedAt || it.createdAt}</td>
                  <td>
                    <input
                      value={draft.assignee}
                      onChange={(e) => setDraft(it, { assignee: e.target.value })}
                      placeholder="责任人"
                    />
                  </td>
                  <td>
                    <input
                      value={draft.assigneeGroup}
                      onChange={(e) => setDraft(it, { assigneeGroup: e.target.value })}
                      placeholder="责任组"
                    />
                  </td>
                  <td>
                    <input value={draft.note} onChange={(e) => setDraft(it, { note: e.target.value })} placeholder="备注" />
                  </td>
                  <td>
                    <input
                      value={draft.estimatedResolveAt}
                      onChange={(e) => setDraft(it, { estimatedResolveAt: e.target.value })}
                      placeholder="YYYY-MM-DD"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={draft.syncInternal}
                      onChange={(e) => setDraft(it, { syncInternal: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={draft.priority}
                      onChange={(e) => setDraft(it, { priority: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input value={draft.dueAt} onChange={(e) => setDraft(it, { dueAt: e.target.value })} placeholder="YYYY-MM-DD" />
                  </td>
                  <td className={overdue ? 'danger' : ''}>{it.overdueDays}</td>
                  <td>
                    <button disabled={savingKey === rowKey(it)} onClick={() => void save(it)}>
                      {savingKey === rowKey(it) ? '保存中…' : '保存'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
