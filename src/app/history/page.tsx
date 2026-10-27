"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { PageHeader, StatusBadge, ConfirmDialog, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { SpeedUnitToggle } from "@/components/SpeedUnitToggle";
import {
  listResults, deleteResult, clearAll, toCsv,
} from "@/lib/history";
import type { SpeedResult } from "@/lib/validation";
import { formatSpeed, readSpeedUnit, storeSpeedUnit, type SpeedUnit } from "@/lib/units";
import { Trash2, Download, X } from "lucide-react";

type SortKey = "timestamp" | "downloadMbps" | "uploadMbps" | "idleLatencyMs" | "jitterMs";
type SortDir = "asc" | "desc";
const AVG = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export default function HistoryPage() {
  const [all, setAll] = useState<SpeedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<SpeedUnit>("Mbps");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [draftIsp, setDraftIsp] = useState("");
  const [ispFilter, setIspFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<SpeedResult | null>(null);
  const [confirm, setConfirm] = useState<"delete-selected" | "clear-all" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { setUnit(readSpeedUnit()); }, []);
  const changeUnit = (u: SpeedUnit) => { setUnit(u); storeSpeedUnit(u); };

  const load = () => {
    setLoading(true);
    listResults()
      .then((r) => { setAll(r); setLoading(false); })
      .catch(() => { setError("Could not load history (IndexedDB unavailable)."); setLoading(false); });
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let rows = [...all];
    if (from) rows = rows.filter((r) => r.timestamp.slice(0, 10) >= from);
    if (to) rows = rows.filter((r) => r.timestamp.slice(0, 10) <= to);
    if (ispFilter) rows = rows.filter((r) => (r.isp ?? "").toLowerCase().includes(ispFilter.toLowerCase()));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => [r.id, r.isp ?? "", r.server, r.publicIp ?? ""].join(" ").toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [all, from, to, ispFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);
  const isps = useMemo(() => [...new Set(all.map((r) => r.isp).filter(Boolean))] as string[], [all]);

  const analytics = useMemo(() => ({
    avgDl: AVG(filtered.map((r) => r.downloadMbps)),
    avgUl: AVG(filtered.map((r) => r.uploadMbps)),
    avgPing: AVG(filtered.map((r) => r.idleLatencyMs)),
    avgJit: AVG(filtered.map((r) => r.jitterMs)),
  }), [filtered]);

  const downloadFile = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const exportRows = (rows: SpeedResult[], name: string) => {
    downloadFile(toCsv(rows, unit), name, "text/csv");
    setToast(`Exported ${rows.length} record(s) as CSV.`);
  };

  const applyFilters = () => {
    setSearch(draftSearch); setFrom(draftFrom); setTo(draftTo); setIspFilter(draftIsp); setPage(1);
  };
  const resetFilters = () => {
    setDraftSearch(""); setDraftFrom(""); setDraftTo(""); setDraftIsp("");
    setSearch(""); setFrom(""); setTo(""); setIspFilter(""); setPage(1);
  };

  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectPage = (checked: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    pageRows.forEach((r) => { if (checked) next.add(r.id); else next.delete(r.id); });
    return next;
  });

  const doDeleteSelected = async () => {
    for (const id of selected) await deleteResult(id).catch(() => undefined);
    setSelected(new Set());
    setConfirm(null);
    setToast(`Deleted ${selected.size} record(s).`);
    load();
  };
  const doClearAll = async () => {
    await clearAll().catch(() => undefined);
    setSelected(new Set());
    setConfirm(null);
    setToast("History cleared.");
    load();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const fmt = (v: number, isSpeed = true) => (isSpeed ? formatSpeed(v, unit) : `${Math.round(v * 10) / 10} ms`);
  const datasetNote = filtered.length === all.length
    ? `All ${all.length} stored record(s)`
    : `Filtered: ${filtered.length} of ${all.length} stored record(s)`;

  if (error) return <ErrorState>{error}</ErrorState>;
  if (loading) return <Skeleton label="Loading history" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test History"
        description="History is stored locally in this browser (IndexedDB) — it is not on a server and does not sync between devices. Analytics, chart and export below all use the stored records shown here."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SpeedUnitToggle unit={unit} onChange={changeUnit} />
            <button type="button" onClick={() => exportRows(filtered, "netpulse-history-filtered.csv")} disabled={filtered.length === 0} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--np-border)" }}>
              <Download className="inline h-4 w-4" aria-hidden="true" /> Export CSV
            </button>
            <button type="button" onClick={() => setConfirm("delete-selected")} disabled={selected.size === 0} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--np-border)" }}>
              Delete Selected ({selected.size})
            </button>
            <button type="button" onClick={() => setConfirm("clear-all")} disabled={all.length === 0} className="flex items-center gap-1 rounded-full bg-[#ef4444] px-4 py-2 text-sm text-white disabled:opacity-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear All
            </button>
          </div>
        }
      />
      {toast && <p className="rounded-lg p-3 text-sm" style={{ background: "#10b98122", color: "#10b981" }} role="status">{toast}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Avg Download", fmt(analytics.avgDl)],
          ["Avg Upload", fmt(analytics.avgUl)],
          ["Avg Ping", fmt(analytics.avgPing, false)],
          ["Avg Jitter", fmt(analytics.avgJit, false)],
        ].map(([label, value]) => (
          <div key={label} className="np-card p-5">
            <p className="text-sm np-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold">{all.length === 0 ? "—" : value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs np-muted">{datasetNote}. Period: {all.length ? `${new Date(all.at(-1)?.timestamp ?? "").toLocaleDateString()} → ${new Date(all.at(0)?.timestamp ?? "").toLocaleDateString()}` : "no tests yet"}.</p>

      <section className="np-card p-5" aria-label="Historical chart">
        <h2 className="font-semibold">Historical Performance</h2>
        <p className="text-xs np-muted">Download and upload over time, from stored records only.</p>
        <div className="mt-4 h-64">
          {filtered.length === 0 ? (
            <EmptyState>No history data for the selected period.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...filtered].reverse().map((r) => ({ label: new Date(r.timestamp).toLocaleDateString(), download: unit === "MBps" ? r.downloadMbps / 8 : r.downloadMbps, upload: unit === "MBps" ? r.uploadMbps / 8 : r.uploadMbps }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2c4a" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} label={{ value: unit === "MBps" ? "MB/s" : "Mbps", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
                <Tooltip formatter={(v, name) => [`${Number(v).toFixed(1)} ${unit === "MBps" ? "MB/s" : "Mbps"}`, name]} contentStyle={{ background: "#101a30", border: "1px solid #1e2c4a", borderRadius: 8 }} />
                <Line type="monotone" dataKey="download" name="Download" stroke="#00a8ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="upload" name="Upload" stroke="#a855f7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="np-card p-5" aria-label="Filters">
        <h2 className="font-semibold">Filters</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="hist-search" className="text-xs np-muted">Search</label>
            <input id="hist-search" value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} placeholder="Search ISP, server, IP…" className="np-input mt-1 w-full" />
          </div>
          <div>
            <label htmlFor="hist-from" className="text-xs np-muted">From Date</label>
            <input id="hist-from" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="np-input mt-1 w-full" />
          </div>
          <div>
            <label htmlFor="hist-to" className="text-xs np-muted">To Date</label>
            <input id="hist-to" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="np-input mt-1 w-full" />
          </div>
          <div>
            <label htmlFor="hist-isp" className="text-xs np-muted">ISP</label>
            <select id="hist-isp" value={draftIsp} onChange={(e) => setDraftIsp(e.target.value)} className="np-input mt-1 w-full">
              <option value="">All ISPs</option>
              {isps.map((i) => (<option key={i} value={i}>{i}</option>))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={applyFilters} className="np-btn-primary px-5 py-2 text-sm">Apply</button>
          <button type="button" onClick={resetFilters} className="rounded-full border px-5 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Reset</button>
        </div>
      </section>

      <section className="np-card p-5" aria-label="Test results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Results ({filtered.length})</h2>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="rows-per-page" className="np-muted">Rows per page</label>
            <select id="rows-per-page" value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="np-input px-2 py-1">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="mt-4"><EmptyState>{all.length === 0 ? "No history data. Run a test on the Dashboard to record your first result." : "No results match the current filters."}</EmptyState></div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left np-muted">
                    <th className="py-2 pr-2"><input type="checkbox" aria-label="Select all on this page" checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))} onChange={(e) => selectPage(e.target.checked)} /></th>
                    <th className="pr-2"><button type="button" onClick={() => toggleSort("timestamp")}>Date / Time {sortKey === "timestamp" ? (sortDir === "desc" ? "↓" : "↑") : ""}</button></th>
                    <th className="pr-2"><button type="button" onClick={() => toggleSort("downloadMbps")}>Download {sortKey === "downloadMbps" ? (sortDir === "desc" ? "↓" : "↑") : ""}</button></th>
                    <th className="pr-2"><button type="button" onClick={() => toggleSort("uploadMbps")}>Upload {sortKey === "uploadMbps" ? (sortDir === "desc" ? "↓" : "↑") : ""}</button></th>
                    <th className="pr-2"><button type="button" onClick={() => toggleSort("idleLatencyMs")}>Ping {sortKey === "idleLatencyMs" ? (sortDir === "desc" ? "↓" : "↑") : ""}</button></th>
                    <th className="pr-2"><button type="button" onClick={() => toggleSort("jitterMs")}>Jitter {sortKey === "jitterMs" ? (sortDir === "desc" ? "↓" : "↑") : ""}</button></th>
                    <th className="pr-2">ISP</th><th className="pr-2">Server</th><th className="pr-2">Public IP</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--np-border)" }}>
                      <td className="py-2 pr-2"><input type="checkbox" aria-label={`Select test ${r.id}`} checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                      <td className="py-2 pr-2">{new Date(r.timestamp).toLocaleString()}</td>
                      <td className="pr-2 tabular-nums">{formatSpeed(r.downloadMbps, unit)}</td>
                      <td className="pr-2 tabular-nums">{formatSpeed(r.uploadMbps, unit)}</td>
                      <td className="pr-2 tabular-nums">{r.idleLatencyMs} ms</td>
                      <td className="pr-2 tabular-nums">{r.jitterMs} ms</td>
                      <td className="pr-2">{r.isp ?? "—"}</td>
                      <td className="pr-2">{r.server}</td>
                      <td className="pr-2">{r.hideIp ? "hidden by user" : (r.publicIp ?? "—")}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => setDetail(r)} className="rounded-full border px-2 py-1 text-xs" style={{ borderColor: "var(--np-border)" }}>Details</button>
                        <button type="button" onClick={() => { deleteResult(r.id).then(() => { setToast("Record deleted."); load(); }).catch(() => undefined); }} className="ml-1 rounded-full border px-2 py-1 text-xs" style={{ borderColor: "var(--np-border)" }} aria-label={`Delete test ${r.id}`}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm" aria-label="Pagination">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded-full border px-3 py-1 disabled:opacity-50" style={{ borderColor: "var(--np-border)" }}>← Prev</button>
              <span>Page {safePage} of {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="rounded-full border px-3 py-1 disabled:opacity-50" style={{ borderColor: "var(--np-border)" }}>Next →</button>
            </nav>
          </>
        )}
      </section>

      {detail && (
        <div className="np-card p-5" role="dialog" aria-modal="true" aria-label="Test detail" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Test Detail — {detail.id}</h2>
            <button type="button" onClick={() => setDetail(null)} aria-label="Close detail" className="rounded-full border p-1.5" style={{ borderColor: "var(--np-border)" }}><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Timestamp", new Date(detail.timestamp).toLocaleString()],
              ["Download", formatSpeed(detail.downloadMbps, unit)],
              ["Upload", formatSpeed(detail.uploadMbps, unit)],
              ["Ping (Idle)", `${detail.idleLatencyMs} ms`],
              ["Download latency", `${detail.downloadLatencyMs} ms`],
              ["Upload latency", `${detail.uploadLatencyMs} ms`],
              ["Jitter", `${detail.jitterMs} ms (max ${detail.maxJitterMs} ms)`],
              ["Packet loss", `${detail.httpRequestLossPercent}% — HTTP request loss, not ICMP`],
              ["ISP", detail.isp ?? "unknown"],
              ["Server", detail.server],
              ["Public IP", detail.hideIp ? "hidden by user" : (detail.publicIp ?? "unknown")],
            ].map(([k, v]) => (
              <div key={k} className="np-elevated p-3"><dt className="text-xs np-muted">{k}</dt><dd className="mt-0.5 break-all font-semibold">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`/print/${detail.id}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#2563ff] px-4 py-2 text-sm text-white">View Full Result</a>
            <button type="button" onClick={() => exportRows([detail], `netpulse-${detail.id}.csv`)} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Export CSV</button>
            <button type="button" onClick={() => setDetail(null)} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--np-border)" }}>Close</button>
          </div>
          <p className="mt-2 text-xs np-muted">“View Full Result” opens the print report for this record. The share/result pages encode the payload in the URL fragment — there is no server-side result store.</p>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "delete-selected"}
        title="Delete selected tests?"
        body={`This deletes ${selected.size} selected record(s) from this browser's IndexedDB. This cannot be undone.`}
        confirmLabel="Delete selected"
        onConfirm={() => void doDeleteSelected()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "clear-all"}
        title="Clear all history?"
        body={`This deletes all ${all.length} stored test record(s) from this browser's IndexedDB. This cannot be undone.`}
        confirmLabel="Clear all"
        onConfirm={() => void doClearAll()}
        onCancel={() => setConfirm(null)}
      />
      <p className="text-xs np-muted"><StatusBadge tone="ok">IndexedDB</StatusBadge> Records are validated on load; invalid or duplicate records are dropped from display (never rendered as invented data), and the underlying store schema is unchanged (v1), so existing records survive this redesign.</p>
    </div>
  );
}
