"use client";

import { useEffect, useState } from "react";
import { listResults, deleteResult, toCsv } from "@/lib/history";
import { SpeedUnitToggle } from "@/components/SpeedUnitToggle";
import {
  formatSpeed,
  readSpeedUnit,
  storeSpeedUnit,
  type SpeedUnit,
} from "@/lib/units";
import type { SpeedResult } from "@/lib/validation";

export default function HistoryPage() {
  const [items, setItems] = useState<SpeedResult[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [unit, setUnit] = useState<SpeedUnit>("Mbps");
  useEffect(() => {
    setUnit(readSpeedUnit());
  }, []);
  const changeUnit = (u: SpeedUnit) => {
    setUnit(u);
    storeSpeedUnit(u);
  };

  const refresh = () =>
    listResults()
      .then((r) => {
        setItems(r);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  useEffect(() => {
    void refresh();
  }, []);

  const filtered = items.filter((r) => {
    const d = r.timestamp.slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  });
  const compared = filtered.filter((r) => selected.includes(r.id));

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  if (!loaded)
    return (
      <div
        className="animate-pulse h-24 rounded bg-gray-100 dark:bg-gray-800"
        aria-label="Loading history"
      />
    );
  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
      aria-label="Test history"
    >
      <h1 className="text-2xl font-bold">Test History</h1>
      <p className="text-sm text-gray-500">
        Stored in IndexedDB in this browser only. Nothing is sent to a server
        without your action.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <label>
          From{" "}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border px-2 py-1 dark:bg-gray-800"
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border px-2 py-1 dark:bg-gray-800"
          />
        </label>
        <SpeedUnitToggle unit={unit} onChange={changeUnit} />
        <button
          onClick={() => {
            const b = new Blob([toCsv(filtered, unit)], { type: "text/csv" });
            const u = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = u;
            a.download = "netpulse-history.csv";
            a.click();
            URL.revokeObjectURL(u);
          }}
          className="rounded-md border px-3 py-1"
        >
          Export filtered CSV
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-gray-500">
          No history yet. Run a test from the dashboard to create one.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800"
            >
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={() => toggle(r.id)}
                aria-label={`Select ${r.id} for comparison`}
              />
              <span className="font-medium">
                {new Date(r.timestamp).toLocaleString()}
              </span>
              <span>↓ {formatSpeed(r.downloadMbps, unit)}</span>
              <span>↑ {formatSpeed(r.uploadMbps, unit)}</span>
              <span>Ping {r.idleLatencyMs} ms</span>
              <span>Jitter {r.jitterMs} ms</span>
              <span className="text-gray-500">
                {r.isp ?? "ISP unknown"} · {r.server}
              </span>
              <button
                onClick={() => deleteResult(r.id).then(refresh)}
                className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {compared.length >= 2 && (
        <div className="mt-6 overflow-x-auto" aria-label="Comparison">
          <h2 className="font-semibold">
            Comparison ({compared.length} results)
          </h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th>Metric</th>
                {compared.map((r) => (
                  <th key={r.id}>
                    {new Date(r.timestamp).toLocaleDateString()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  "downloadMbps",
                  "uploadMbps",
                  "idleLatencyMs",
                  "jitterMs",
                  "httpRequestLossPercent",
                ] as const
              ).map((k) => (
                <tr
                  key={k}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <td className="py-1">{k}</td>
                  {compared.map((r) => (
                    <td key={r.id}>
                      {k === "downloadMbps" || k === "uploadMbps"
                        ? formatSpeed(r[k], unit)
                        : r[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {compared.length === 1 && (
        <p className="mt-4 text-sm text-gray-500">
          Select at least 2 results to compare.
        </p>
      )}
    </section>
  );
}
