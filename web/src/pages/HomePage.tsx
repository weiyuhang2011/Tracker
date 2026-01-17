import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Item } from "../api";

type RepoSummary = {
  repoFullName: string;
  total: number;
  open: number;
  openIssues: number;
  openPrs: number;
  overdueOpen: number;
  openPct: number;
  overduePct: number;
};

function isOpenState(state: string) {
  return state.toLowerCase() === "open";
}

function pct(num: number, den: number) {
  if (den <= 0) return 0;
  return Math.round((num / den) * 100);
}

function isOverdue(it: Item) {
  if (!isOpenState(it.state)) return false;
  const created = new Date(it.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const diffDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 14;
}

const homePriorityOrder = [
  "yuanrong",
  "yuanrong-functionsystem",
  "yuanrong-datasystem",
];

function repoSortKey(name: string) {
  const normalized = name.toLowerCase();
  // exact match first
  const exactIdx = homePriorityOrder.findIndex(
    (r) => r.toLowerCase() === normalized,
  );
  if (exactIdx !== -1) return exactIdx;
  // allow repoFullName with owner prefix, e.g. org/yuanrong
  const suffixIdx = homePriorityOrder.findIndex((r) =>
    normalized.endsWith(`/${r.toLowerCase()}`),
  );
  if (suffixIdx !== -1) return suffixIdx;
  return Number.POSITIVE_INFINITY;
}

function DualDonut(props: { openPct: number; overduePct: number }) {
  const openPct = Math.min(Math.max(props.openPct, 0), 100);
  const overduePct = Math.min(Math.max(props.overduePct, 0), 100);
  return (
    <div className="dualDonut">
      <div
        className="donutOuter"
        style={{
          background: `conic-gradient(#2563eb ${openPct}%, #e5e7eb 0)`,
        }}
        aria-label={`Open ratio ${openPct}%`}
      >
        <div
          className="donutInner"
          style={{
            background: `conic-gradient(#ef4444 ${overduePct}%, #e5e7eb 0)`,
          }}
          aria-label={`Overdue ratio ${overduePct}% of open`}
        />
      </div>
    </div>
  );
}

export function HomePage(props: {
  items: Item[];
  loading: boolean;
  onRefresh: () => void;
  onSync: () => void;
  error: string | null;
  onItemUpdated: (it: Item) => void;
}) {
  const summaries = useMemo(() => {
    const map = new Map<string, RepoSummary>();
    for (const it of props.items) {
      const cur =
        map.get(it.repoFullName) ??
        {
          repoFullName: it.repoFullName,
          total: 0,
          open: 0,
          openIssues: 0,
          openPrs: 0,
          overdueOpen: 0,
          openPct: 0,
          overduePct: 0,
        };
      cur.total += 1;
      if (isOpenState(it.state)) {
        cur.open += 1;
        if (it.kind === "issue") cur.openIssues += 1;
        else cur.openPrs += 1;
        if (isOverdue(it)) cur.overdueOpen += 1;
      }
      map.set(it.repoFullName, cur);
    }
    const list = Array.from(map.values()).map((r) => ({
      ...r,
      openPct: pct(r.open, r.total),
      overduePct: pct(r.overdueOpen, r.open),
    }));
    return list.sort((a, b) => {
      const pa = repoSortKey(a.repoFullName);
      const pb = repoSortKey(b.repoFullName);
      if (pa !== pb) return pa - pb;
      return a.repoFullName.localeCompare(b.repoFullName);
    });
  }, [props.items]);

  return (
    <div className="container">
      <header className="boardHeader">
        <div>
          <div className="eyebrow">Overview</div>
          <div className="boardTitle">
            <h1>Repository Health</h1>
            <span className="subtitle">
              Open vs total, plus overdue signals by repo
            </span>
          </div>
        </div>
        <div className="headerActions">
          <button
            className="ghostButton"
            onClick={props.onRefresh}
            disabled={props.loading}
          >
            {props.loading ? "刷新中…" : "刷新"}
          </button>
          <button
            className="primaryButton"
            onClick={props.onSync}
            disabled={props.loading}
          >
            {props.loading ? "同步中…" : "同步"}
          </button>
        </div>
      </header>

      {props.error ? <div className="errorBanner">{props.error}</div> : null}

      {summaries.length === 0 ? (
        <div className="summaryEmpty">
          <div className="eyebrow muted">暂无数据</div>
          <div className="muted">先同步数据后查看概览。</div>
        </div>
      ) : null}

      <div className="summaryGrid">
        {summaries.map((s) => (
          <div key={s.repoFullName} className="summaryCard">
            <div className="summaryHeader">
              <div>
                <Link
                  className="repoTitle"
                  to={`/repo/${encodeURIComponent(s.repoFullName)}`}
                >
                  {s.repoFullName}
                </Link>
                <div className="muted small">
                  未闭环 {s.open} / 总计 {s.total}
                </div>
              </div>
              <span className="pill pillMuted">Open {s.openPct}%</span>
            </div>

            <div className="summaryBody">
              <DualDonut openPct={s.openPct} overduePct={s.overduePct} />
              <div className="summaryLegend">
                <div>
                  <div className="legendDot legendOpen" />
                  <div>
                    <div className="legendLabel">未闭环占比</div>
                    <div className="legendValue">{s.openPct}%</div>
                  </div>
                </div>
                <div>
                  <div className="legendDot legendOverdue" />
                  <div>
                    <div className="legendLabel">超期占未闭环</div>
                    <div className="legendValue">{s.overduePct}%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="summaryFooter">
              <div>
                <div className="muted small">Issue 未闭环</div>
                <div className="statValue">{s.openIssues}</div>
              </div>
              <div>
                <div className="muted small">PR 未闭环</div>
                <div className="statValue">{s.openPrs}</div>
              </div>
              <div>
                <div className="muted small">超期（未闭环）</div>
                <div className="statValue dangerText">{s.overdueOpen}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
