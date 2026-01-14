import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { fetchItems, patchItem, type Item } from './api'

type Editable = Pick<
  Item,
  'assignee' | 'assigneeGroup' | 'note' | 'estimatedResolveAt' | 'syncInternal' | 'priority' | 'dueAt'
>

function App() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, Editable>>({})

  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      // overdue first, then due date, then updated
      if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays
      if (a.dueAt !== b.dueAt) return (b.dueAt || '').localeCompare(a.dueAt || '')
      return (b.updatedAt || '').localeCompare(a.updatedAt || '')
    })
    return copy
  }, [items])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchItems()
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function syncNow() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(new URL('/api/sync', import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'), {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`sync failed: ${res.status}`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

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
    const draft = getDraft(it)
    const updated = await patchItem(it.kind, it.repoFullName, it.key, draft)
    setItems((prev) => prev.map((x) => (rowKey(x) === rowKey(it) ? updated : x)))
    setEditing((prev) => {
      const next = { ...prev }
      delete next[rowKey(it)]
      return next
    })
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <h1 style={{ margin: '8px 0 12px' }}>openYuanRong 看板</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={refresh} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
        <button onClick={() => void syncNow()} disabled={loading}>
          同步
        </button>
        {error ? <span style={{ color: 'crimson' }}>{error}</span> : null}
        <span style={{ marginLeft: 'auto', opacity: 0.7 }}>共 {items.length} 条</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">类型</th>
              <th align="left">仓库</th>
              <th align="left">编号</th>
              <th align="left">标题</th>
              <th align="left">状态</th>
              <th align="left">责任人</th>
              <th align="left">责任组</th>
              <th align="left">备注</th>
              <th align="left">预期解决时间</th>
              <th align="left">同步内部</th>
              <th align="left">优先级</th>
              <th align="left">到期时间</th>
              <th align="left">超期天数</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((it) => {
              const draft = getDraft(it)
              const overdueStyle = it.overdueDays > 0 ? { color: 'crimson', fontWeight: 600 } : undefined

              return (
                <tr key={rowKey(it)}>
                  <td>{it.kind}</td>
                  <td>{it.repoFullName}</td>
                  <td>{it.key}</td>
                  <td>
                    <a href={it.url} target="_blank" rel="noreferrer">
                      {it.title}
                    </a>
                  </td>
                  <td>{it.state}</td>
                  <td>
                    <input
                      value={draft.assignee}
                      onChange={(e) => setDraft(it, { assignee: e.target.value })}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.assigneeGroup}
                      onChange={(e) => setDraft(it, { assigneeGroup: e.target.value })}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.note}
                      onChange={(e) => setDraft(it, { note: e.target.value })}
                      style={{ width: 200 }}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.estimatedResolveAt}
                      onChange={(e) => setDraft(it, { estimatedResolveAt: e.target.value })}
                      placeholder="YYYY-MM-DD"
                      style={{ width: 130 }}
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
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.dueAt}
                      onChange={(e) => setDraft(it, { dueAt: e.target.value })}
                      placeholder="YYYY-MM-DD"
                      style={{ width: 130 }}
                    />
                  </td>
                  <td style={overdueStyle}>{it.overdueDays}</td>
                  <td>
                    <button onClick={() => void save(it)}>保存</button>
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

export default App
