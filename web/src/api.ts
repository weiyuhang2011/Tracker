export type Item = {
  kind: 'issue' | 'pr'
  repoFullName: string
  key: string
  title: string
  state: string
  url: string
  author: string
  createdAt: string
  updatedAt: string
  assignee: string
  assigneeGroup: string
  note: string
  estimatedResolveAt: string
  syncInternal: boolean
  priority: number
  dueAt: string
  overdueDays: number
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'

export async function fetchItems(params?: { kind?: string; repo?: string }): Promise<Item[]> {
  const url = new URL('/api/items', API_BASE)
  if (params?.kind) url.searchParams.set('kind', params.kind)
  if (params?.repo) url.searchParams.set('repo', params.repo)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetchItems failed: ${res.status}`)
  const data = (await res.json()) as { items: Item[] }
  return data.items ?? []
}

export async function patchItem(
  kind: Item['kind'],
  repoFullName: string,
  key: string,
  patch: Partial<Item>
): Promise<Item> {
  const [owner, repo] = splitRepo(repoFullName)
  const url = new URL(`/api/items/${kind}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(key)}`, API_BASE)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assignee: patch.assignee,
      assigneeGroup: patch.assigneeGroup,
      note: patch.note,
      estimatedResolveAt: patch.estimatedResolveAt,
      syncInternal: patch.syncInternal,
      priority: patch.priority,
      dueAt: patch.dueAt,
    }),
  })
  if (!res.ok) throw new Error(`patchItem failed: ${res.status}`)
  return (await res.json()) as Item
}

function splitRepo(repoFullName: string): [string, string] {
  const parts = repoFullName.split('/')
  if (parts.length >= 2) return [parts[0], parts.slice(1).join('/')]
  return [repoFullName, '']
}
