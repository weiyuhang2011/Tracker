import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { patchItem, type Item } from "../api";

type Editable = Pick<
  Item,
  | "assignee"
  | "assigneeGroup"
  | "note"
  | "syncInternal"
  | "priority"
  | "dueAt"
> & { unsyncedReason?: string };

type Props = {
  items: Item[];
  onItemUpdated: (it: Item) => void;
  initialRepo?: string | null;
  initialKind?: Item["kind"] | "all";
  initialState?: "open" | "closed" | "all";
  showBackHome?: boolean;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onSync?: () => void;
};

function isOpenState(state: string) {
  return state.toLowerCase() === "open";
}

function byCreatedDesc(a: Item, b: Item) {
  return (b.createdAt || "").localeCompare(a.createdAt || "");
}

const palette = ["#e11d48", "#f59e0b", "#10b981", "#2563eb", "#8b5cf6"];

function uniqueStrings(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

function repoStripeColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0; // force int
  }
  return palette[Math.abs(hash) % palette.length];
}

function ownerName(it: Item) {
  return it.assignee || "none";
}

function ownerInitial(value: string) {
  return value.slice(0, 1).toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatOverdue(days?: number | null) {
  if (days === undefined || days === null) return "—";
  if (days > 0) return `+${days}d`;
  if (days < 0) return `-${Math.abs(days)}d`;
  return "0d";
}

function derivedOverdueDays(it: Item) {
  const today = new Date();
  const due = it.dueAt ? new Date(it.dueAt) : null;
  const created = new Date(it.createdAt);
  const fallbackDue = Number.isNaN(created.getTime())
    ? null
    : new Date(created.getTime() + 14 * 24 * 60 * 60 * 1000);
  const target = due && !Number.isNaN(due.getTime()) ? due : fallbackDue;
  if (!target) return 0;
  const diffDays = Math.floor(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diffDays;
}

function timeAgo(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function priorityTone(p?: number | null) {
  if (p === 0) return { label: "紧急", tone: "priority-0" };
  if (p === 1) return { label: "高", tone: "priority-1" };
  if (p === 2) return { label: "中", tone: "priority-2" };
  return { label: "低", tone: "priority-3" };
}

function priorityLabel(value?: number | null) {
  if (value === 0) return "紧急";
  if (value === 1) return "高";
  if (value === 2) return "中";
  if (value === 3) return "低";
  return "未知";
}

function filterOptions(opts: string[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return opts;
  return opts.filter((o) => o.toLowerCase().includes(q));
}

async function notifyInternalIssue(item: Item) {
  // 示例：同步到内部代码仓创建 issue，后续可替换为真实 API
  try {
    await fetch("https://internal.example.com/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: item.repoFullName,
        title: item.title,
        link: item.url,
        priority: item.priority,
        assignee: item.assignee,
      }),
    });
  } catch {
    // swallow demo call failures
  }
}

function kindTone(kind: Item["kind"]) {
  if (kind === "pr") return { label: "PR", tone: "type-pr" };
  return { label: "Issue", tone: "type-issue" };
}

export function RepositoryBoard(props: Props) {
  const [selectedRepo, setSelectedRepo] = useState<string>(
    props.initialRepo ?? "all",
  );
  const [selectedKind, setSelectedKind] = useState<Item["kind"] | "all">(
    props.initialKind ?? "issue",
  );
  const [selectedState, setSelectedState] = useState<"open" | "closed" | "all">(
    props.initialState ?? "open",
  );
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Editable>>({});
  const [modalItem, setModalItem] = useState<Item | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [csvAssignees, setCsvAssignees] = useState<string[]>([]);
  const [csvTeams, setCsvTeams] = useState<string[]>([]);
  const [assigneeFocused, setAssigneeFocused] = useState(false);
  const [teamFocused, setTeamFocused] = useState(false);

  useEffect(() => {
    if (props.initialRepo) setSelectedRepo(props.initialRepo);
  }, [props.initialRepo]);

  useEffect(() => {
    if (props.initialKind) setSelectedKind(props.initialKind);
  }, [props.initialKind]);

  useEffect(() => {
    if (props.initialState) setSelectedState(props.initialState);
  }, [props.initialState]);

  useEffect(() => {
    const loadCsv = async (url: string, setter: (vals: string[]) => void) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const text = await res.text();
        const rows = text
          .split(/\r?\n/)
          .map((line) => line.split(",")[0]?.trim())
          .filter((x) => x);
        setter(Array.from(new Set(rows)));
      } catch {
        // ignore CSV load failures
      }
    };
    void loadCsv("/data/assignees.csv", setCsvAssignees);
    void loadCsv("/data/teams.csv", setCsvTeams);
  }, []);

  function rowKey(it: Item) {
    return `${it.kind}:${it.repoFullName}:${it.key}`;
  }

  function getDraft(it: Item): Editable {
    const k = rowKey(it);
    return (
      editing[k] ?? {
        assignee: it.assignee || "none",
        assigneeGroup: it.assigneeGroup,
        note: it.note,
        syncInternal: it.syncInternal,
        priority: it.priority ?? 3,
        dueAt: it.dueAt,
        unsyncedReason: undefined,
      }
    );
  }

  function setDraft(it: Item, patch: Partial<Editable>) {
    const k = rowKey(it);
    const current = getDraft(it);
    setEditing((prev) => ({ ...prev, [k]: { ...current, ...patch } }));
  }

  async function save(it: Item, opts?: { closeModal?: boolean }) {
    const k = rowKey(it);
    const draft = getDraft(it);
    if (!draft.syncInternal && !draft.unsyncedReason?.trim()) {
      setFormError("未同步时请填写单独的原因。");
      return;
    }
    const noteForPatch =
      draft.syncInternal || !draft.unsyncedReason
        ? draft.note
        : `${draft.note ? `${draft.note}\n` : ""}[不同步原因] ${draft.unsyncedReason}`;
    const { unsyncedReason, ...rest } = draft;
    const payload = {
      assignee: rest.assignee?.trim() || undefined,
      assigneeGroup: rest.assigneeGroup?.trim() || undefined,
      note: noteForPatch?.trim() || undefined,
      syncInternal: Boolean(rest.syncInternal),
      priority: Number.isFinite(rest.priority) ? rest.priority : 3,
      dueAt: rest.dueAt?.trim() || undefined,
    };
    try {
      setSavingKey(k);
      const updated = await patchItem(it.kind, it.repoFullName, it.key, payload);
      props.onItemUpdated(updated);
      setEditing((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      if (opts?.closeModal) {
        setModalItem(null);
      }
      setFormError(null);
      if (payload.syncInternal) {
        void notifyInternalIssue(updated);
      }
    } finally {
      setSavingKey(null);
    }
  }

  const repoOptions = useMemo(() => {
    return Array.from(new Set(props.items.map((it) => it.repoFullName))).sort();
  }, [props.items]);

  const teamOptions = useMemo(() => {
    return uniqueStrings([
      ...props.items.map((it) => it.assigneeGroup),
      ...csvTeams,
    ]).sort();
  }, [props.items, csvTeams]);

  const assigneeOptions = useMemo(() => {
    return uniqueStrings([
      ...props.items.map((it) => it.assignee || "none"),
      ...csvAssignees,
    ]).sort();
  }, [props.items, csvAssignees]);

  const priorityOptions = useMemo(() => {
    return Array.from(
      new Set(props.items.map((it) => it.priority).filter((x) => x !== undefined && x !== null)),
    )
      .sort((a, b) => Number(a) - Number(b))
      .map((p) => p.toString());
  }, [props.items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return props.items
      .filter((it) =>
        selectedRepo === "all" ? true : it.repoFullName === selectedRepo,
      )
      .filter((it) =>
        selectedKind === "all" ? true : it.kind === selectedKind,
      )
      .filter((it) =>
        selectedState === "all"
          ? true
          : selectedState === "open"
            ? isOpenState(it.state)
            : !isOpenState(it.state),
      )
      .filter((it) =>
        selectedTeam === "all" ? true : it.assigneeGroup === selectedTeam,
      )
      .filter((it) =>
        selectedAssignee === "all"
          ? true
          : (it.assignee || "Unassigned").toLowerCase() ===
            selectedAssignee.toLowerCase(),
      )
      .filter((it) =>
        selectedPriority === "all"
          ? true
          : String(it.priority) === selectedPriority,
      )
      .filter((it) => {
        if (!term) return true;
        return (
          it.title.toLowerCase().includes(term) ||
          (it.note ?? "").toLowerCase().includes(term) ||
          it.repoFullName.toLowerCase().includes(term) ||
          ownerName(it).toLowerCase().includes(term)
        );
      });
  }, [
    props.items,
    search,
    selectedKind,
    selectedState,
    selectedAssignee,
    selectedPriority,
    selectedRepo,
    selectedTeam,
  ]);

  const displayItems = useMemo(() => {
    return [...filteredItems].sort(byCreatedDesc);
  }, [filteredItems]);

  const overdueCount = useMemo(() => {
    return displayItems.filter((it) => derivedOverdueDays(it) > 0).length;
  }, [displayItems]);

  const modalDraft = modalItem ? getDraft(modalItem) : null;
  const modalKey = modalItem ? rowKey(modalItem) : null;

  return (
    <div className="container">
      <header className="boardHeader">
        <div>
          <div className="eyebrow">Repository Board</div>
          <div className="boardTitle">
            <h1>Repository Board</h1>
            <span className="subtitle">Issues & PRs across your repos</span>
          </div>
          <div className="boardMeta">
            <span className="pill pillMuted">
              Showing {displayItems.length} items
            </span>
            <span className="pill pillWarning">Overdue {overdueCount}</span>
          </div>
        </div>
        <div className="headerActions">
          {props.showBackHome && (
            <Link className="ghostButton" to="/">
              ← 返回首页
            </Link>
          )}
          {props.onRefresh ? (
            <button
              className="ghostButton"
              onClick={props.onRefresh}
              disabled={props.loading}
            >
              {props.loading ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
          {props.onSync ? (
            <button
              className="primaryButton"
              onClick={props.onSync}
              disabled={props.loading}
            >
              {props.loading ? "Syncing…" : "Sync now"}
            </button>
          ) : null}
        </div>
      </header>

      {props.error ? <div className="errorBanner">{props.error}</div> : null}

      <div className="filterBar">
        <div className="filterControl">
          <label className="filterLabel">Repo</label>
          <select
            className="filterInput"
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
          >
            <option value="all">All repos</option>
            {repoOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="filterControl">
          <label className="filterLabel">Type</label>
          <select
            className="filterInput"
            value={selectedKind}
            onChange={(e) =>
              setSelectedKind(
                e.target.value === "all" ? "all" : (e.target.value as Item["kind"]),
              )
            }
          >
            <option value="all">All</option>
            <option value="issue">Issues</option>
            <option value="pr">PRs</option>
          </select>
        </div>
        <div className="filterControl">
          <label className="filterLabel">State</label>
          <select
            className="filterInput"
            value={selectedState}
            onChange={(e) =>
              setSelectedState(e.target.value as "open" | "closed" | "all")
            }
          >
            <option value="open">Open only</option>
            <option value="closed">Closed only</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="filterControl">
          <label className="filterLabel">Search</label>
          <input
            className="filterInput"
            placeholder="Search title, note, or assignee"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filterControl">
          <label className="filterLabel">Team</label>
          <select
            className="filterInput"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
          >
            <option value="all">Team: All</option>
            {teamOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="filterControl">
          <label className="filterLabel">Assignee</label>
          <select
            className="filterInput"
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
          >
            <option value="all">Assignee: All</option>
            {assigneeOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="filterControl">
          <label className="filterLabel">Priority</label>
          <select
            className="filterInput"
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
          >
            <option value="all">Priority: All</option>
            {priorityOptions.map((p) => {
              const num = Number(p);
              return (
                <option key={p} value={p}>
                  {priorityLabel(num)}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="tableCard">
        <table className="boardTable">
          <thead>
            <tr>
              <th>Repo</th>
              <th>Type</th>
              <th>Title</th>
              <th>Assignee</th>
              <th>Team</th>
              <th>P</th>
              <th>ETA</th>
              <th>Overdue</th>
              <th>Created</th>
              <th>Note / Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((it) => {
              const draft = getDraft(it);
              const k = rowKey(it);
              const overdueDays = derivedOverdueDays(it);
              const overdue = overdueDays > 0;
              const owner = ownerName(it);
              const { label, tone } = priorityTone(draft.priority);
              const typeTone = kindTone(it.kind);
              return (
                <Fragment key={k}>
                  <tr className={overdue ? "rowOverdue" : undefined}>
                    <td>
                      <div className="repoCell">
                        <span
                          className="repoStripe"
                          style={{ background: repoStripeColor(it.repoFullName) }}
                        />
                        <div>
                          <Link
                            className="repoLink"
                            to={`/repo/${encodeURIComponent(it.repoFullName)}`}
                          >
                            {it.repoFullName}
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`typeBadge ${typeTone.tone}`}>
                        <span className="typeDot">●</span>
                        {typeTone.label}
                      </span>
                    </td>
                    <td className="titleCell">
                      <a href={it.url} target="_blank" rel="noreferrer">
                        {it.title}
                      </a>
                      <div className="muted small">
                        {isOpenState(it.state) ? "Open" : it.state}
                      </div>
                    </td>
                    <td>
                      <div className="ownerCell">
                        <span
                          className="avatar"
                          style={{ background: repoStripeColor(owner) }}
                        >
                          {ownerInitial(owner)}
                        </span>
                        <span>{owner}</span>
                      </div>
                    </td>
                    <td className="muted">{draft.assigneeGroup || "—"}</td>
                    <td>
                      <span className={`priorityPill ${tone}`}>{label}</span>
                    </td>
                    <td>{formatDate(draft.dueAt)}</td>
                    <td
                      className={
                        overdue
                          ? "overduePositive"
                          : overdueDays < 0
                            ? "overdueOnTrack"
                            : "overdueNeutral"
                      }
                    >
                      {formatOverdue(overdueDays)}
                    </td>
                    <td className="muted">{timeAgo(it.createdAt)}</td>
                    <td>
                      <span className="noteText">
                        {draft.note || "Add note"}
                      </span>
                    </td>
                    <td className="actionsCell">
                      <div className="rowActions">
                        <button
                          className="ghostButton smallButton"
                          onClick={() => {
                            setModalItem(it);
                            setFormError(null);
                          }}
                        >
                          Details
                        </button>
                        <a
                          className="ghostIcon"
                          href={it.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open in repo"
                        >
                          ↗
                        </a>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {displayItems.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <div className="emptyState">
                    <div className="eyebrow muted">Nothing to show</div>
                    <div className="muted">
                      Adjust filters or sync to pull fresh items.
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {modalItem ? (
        <div
          className="modalOverlay"
          onClick={() => {
            setModalItem(null);
            setFormError(null);
          }}
        >
          <div
            className="modalCard"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <div className="eyebrow small">
                  {modalItem.kind === "pr" ? "PR 详情" : "Issue 详情"}
                </div>
                <div className="modalTitle">{modalItem.title}</div>
                <div className="muted small">
                  {modalItem.repoFullName}
                </div>
              </div>
              <button
                className="ghostIcon"
                onClick={() => {
                  setModalItem(null);
                  setFormError(null);
                }}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="modalGrid">
                <div className="fieldGroup">
                  <label className="fieldLabel">负责人</label>
                  <input
                    className="fieldInput"
                    value={modalDraft?.assignee ?? ""}
                    onFocus={() => setAssigneeFocused(true)}
                    onBlur={() => setTimeout(() => setAssigneeFocused(false), 120)}
                    onChange={(e) =>
                      modalItem &&
                      setDraft(modalItem, { assignee: e.target.value })
                    }
                    placeholder="输入可搜索（例：bo → bob）"
                  />
                  {assigneeFocused ? (
                    <div className="suggestList">
                      {filterOptions(assigneeOptions, modalDraft?.assignee ?? "").map(
                        (opt) => (
                          <button
                            key={`assignee-${opt}`}
                            type="button"
                            className="suggestItem"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              modalItem && setDraft(modalItem, { assignee: opt })
                            }
                          >
                            {opt}
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="fieldGroup">
                  <label className="fieldLabel">团队/组</label>
                  <input
                    className="fieldInput"
                    value={modalDraft?.assigneeGroup ?? ""}
                    onFocus={() => setTeamFocused(true)}
                    onBlur={() => setTimeout(() => setTeamFocused(false), 120)}
                    onChange={(e) =>
                      modalItem &&
                      setDraft(modalItem, { assigneeGroup: e.target.value })
                    }
                    placeholder="输入可搜索团队"
                  />
                  {teamFocused ? (
                    <div className="suggestList">
                      {filterOptions(teamOptions, modalDraft?.assigneeGroup ?? "").map(
                        (opt) => (
                          <button
                            key={`team-${opt}`}
                            type="button"
                            className="suggestItem"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              modalItem &&
                              setDraft(modalItem, { assigneeGroup: opt })
                            }
                          >
                            {opt}
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="fieldGroup">
                  <label className="fieldLabel">优先级</label>
                  <select
                    className="fieldInput"
                    value={modalDraft?.priority ?? 3}
                    onChange={(e) =>
                      modalItem &&
                      setDraft(modalItem, {
                        priority: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0}>紧急</option>
                    <option value={1}>高</option>
                    <option value={2}>中</option>
                    <option value={3}>低</option>
                  </select>
                </div>
                <div className="fieldGroup">
                  <label className="fieldLabel">预期解决时间</label>
                  <input
                    className="fieldInput"
                    type="date"
                    value={modalDraft?.dueAt ?? ""}
                    onChange={(e) =>
                      modalItem &&
                      setDraft(modalItem, { dueAt: e.target.value })
                    }
                    placeholder="YYYY-MM-DD"
                  />
                </div>
                <div className="fieldGroup">
                  <label className="fieldLabel">备注 / 理由</label>
                  <textarea
                    className="fieldInput textarea"
                    value={modalDraft?.note ?? ""}
                    onChange={(e) =>
                      modalItem &&
                      setDraft(modalItem, { note: e.target.value })
                    }
                    placeholder="未同步时填写原因"
                  />
                </div>
              </div>

              <label className="fieldCheckbox">
                <input
                  type="checkbox"
                  checked={modalDraft?.syncInternal ?? false}
                  onChange={(e) =>
                    modalItem &&
                    setDraft(modalItem, { syncInternal: e.target.checked })
                  }
                />
                <span>是否同步黄区</span>
              </label>
              {!modalDraft?.syncInternal ? (
                <div className="fieldGroup">
                  <label className="fieldLabel">不同步原因（必填）</label>
                  <textarea
                    className="fieldInput textarea"
                    value={modalDraft?.unsyncedReason ?? ""}
                    onChange={(e) =>
                      modalItem &&
                      setDraft(modalItem, { unsyncedReason: e.target.value })
                    }
                    placeholder="说明为何不同步黄区"
                  />
                </div>
              ) : null}

              {formError ? <div className="formError">{formError}</div> : null}

              <div className="modalActions">
                <button
                  className="ghostButton"
                  onClick={() => {
                    setModalItem(null);
                    setFormError(null);
                  }}
                  disabled={modalKey ? savingKey === modalKey : false}
                >
                  取消
                </button>
                <button
                  className="primaryButton"
                  onClick={() =>
                    modalItem && void save(modalItem, { closeModal: true })
                  }
                  disabled={modalKey ? savingKey === modalKey : false}
                >
                  {modalKey && savingKey === modalKey ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
