"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader, InfoCard, Skeleton, ErrorState, StatusBadge } from "@/components/ui";

interface Info {
  ip: string | null; ipv6: string | null; isp: string | null; org: string | null; orgSource: string | null; asn: string | null;
  hostname: string | null; hostnameSource: string | null; country: string | null; region: string | null; city: string | null;
  timezone: string | null; latitude: number | null; longitude: number | null; source: string | null; unavailable: string[];
}

function field(v: string | number | null): string {
  return v === null || v === undefined || v === "" ? "Not detected" : String(v);
}

export default function NetworkPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [browser, setBrowser] = useState("unknown");
  const [os, setOs] = useState("unknown");
  const [device, setDevice] = useState("unknown");
  const [connType, setConnType] = useState("unknown");

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/network-info")
      .then((r) => r.json())
      .then((j: Info) => {
        setInfo(j);
        setUpdated(new Date());
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    const ua = navigator.userAgent;
    const uaData = (navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }).userAgentData;
    setBrowser(uaData?.brands?.map((b) => `${b.brand} ${b.version}`).join(", ") ?? ua);
    setOs(/Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown");
    setDevice(/Mobi/.test(ua) ? "Mobile" : /Tablet|iPad/.test(ua) ? "Tablet" : "Desktop");
    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
    setConnType(nav.connection?.effectiveType ?? "unknown");
  }, [load]);

  if (error) return <ErrorState>Network info could not be loaded. Check your connection and try Refresh.</ErrorState>;
  if (loading || !info) return <Skeleton label="Loading network info" />;

  const hasCoords = info.latitude !== null && info.longitude !== null;
  const mapSrc = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${info.longitude! - 0.15}%2C${info.latitude! - 0.1}%2C${info.longitude! + 0.15}%2C${info.latitude! + 0.1}&layer=mapnik&marker=${info.latitude}%2C${info.longitude}`
    : null;
  const mapsUrl = hasCoords ? `https://www.openstreetmap.org/?mlat=${info.latitude}&mlon=${info.longitude}#map=12/${info.latitude}/${info.longitude}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network Information"
        description="Detailed information about your network and connection. Values come from the server-side lookup provider. Anything not returned is shown as “Not detected” — never invented."
        actions={
          <>
            <button type="button" onClick={load} disabled={loading} className="np-btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </button>
            <span className="text-xs np-muted">Last updated {updated ? updated.toLocaleString() : "—"}</span>
          </>
        }
      />
      {info.unavailable.length > 0 && (
        <p className="rounded-lg p-3 text-sm" style={{ background: "#f59e0b22", color: "#f59e0b" }} role="status">
          Unavailable: {info.unavailable.join(", ")} (private/loopback IP or provider failure).
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="np-card p-5 xl:col-span-7" aria-label="Network information grid">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Public IPv4 Address" value={field(info.ip)} copy={info.ip ?? undefined} />
            <InfoCard label="Public IPv6 Address" value={field(info.ipv6)} copy={info.ipv6 ?? undefined} />
            <InfoCard label="ISP" value={field(info.isp)} copy={info.isp ?? undefined} />
            <InfoCard label="Organization" value={field(info.org)} copy={info.org ?? undefined} />
            <InfoCard label="ASN" value={field(info.asn)} copy={info.asn ?? undefined} />
            <InfoCard label="ISP Hostname" value={field(info.hostname)} copy={info.hostname ?? undefined} />
            <InfoCard label="Country" value={field(info.country)} />
            <InfoCard label="Region" value={field(info.region)} />
            <InfoCard label="City" value={field(info.city)} />
            <InfoCard label="Timezone" value={field(info.timezone)} />
            <InfoCard label="Approximate Location" value={hasCoords ? `${info.latitude}, ${info.longitude} (approximate, provider-supplied)` : "Not detected"} copy={hasCoords ? `${info.latitude}, ${info.longitude}` : undefined} />
            <InfoCard label="Effective Connection Type (browser estimate)" value={connType === "unknown" ? "Not detected" : connType} />
          </div>
          <p className="mt-3 text-xs np-muted">
            Organization source: {info.orgSource ?? "—"} · Hostname source: {info.hostnameSource ?? "—"} · A missing hostname means no reverse-DNS record exists for this IP; it is not invented.
          </p>
        </section>

        <section className="np-card p-5 xl:col-span-5" aria-label="Location on map">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Location on Map</h2>
              <p className="text-xs np-muted">Approximate IP-based location, not a precise device location.</p>
            </div>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: "var(--np-border)" }}>
                Open in Maps
              </a>
            )}
          </div>
          {mapSrc ? (
            <iframe title="Approximate location map" src={mapSrc} className="mt-4 h-72 w-full rounded-lg border-0" loading="lazy" />
          ) : (
            <p className="mt-4 rounded-lg p-4 text-sm np-muted" style={{ background: "var(--np-elevated)" }}>No coordinates were returned, so no map can be shown.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{[info.city, info.region, info.country].filter(Boolean).join(", ") || "Location unknown"}</span>
            {hasCoords && <span className="np-muted tabular-nums">{info.latitude}, {info.longitude} (approximate)</span>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="np-card p-5" aria-label="Device and browser">
          <h2 className="font-semibold">Device &amp; Browser</h2>
          <p className="text-xs np-muted">Client-derived information (this browser), not server-side lookup data.</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="np-muted">Browser</dt><dd className="break-all text-right font-medium">{browser}</dd></div>
            <div className="flex justify-between gap-2"><dt className="np-muted">Operating System</dt><dd className="font-medium">{os}</dd></div>
            <div className="flex justify-between gap-2"><dt className="np-muted">Device Type</dt><dd className="font-medium">{device}</dd></div>
          </dl>
        </section>
        <section className="np-card p-5" aria-label="Network details">
          <h2 className="font-semibold">Network Details</h2>
          <p className="text-xs np-muted">Only fields genuinely available are shown.</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="np-muted">Data Source</dt><dd className="font-medium">{field(info.source)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="np-muted">Organization source</dt><dd className="font-medium">{info.orgSource ?? "Not detected"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="np-muted">Hostname source</dt><dd className="font-medium">{info.hostnameSource ?? "Not detected"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="np-muted">Network Latency (approx)</dt><dd className="font-medium">Not detected</dd></div>
          </dl>
        </section>
        <section className="np-card p-5" aria-label="Privacy and security">
          <h2 className="font-semibold">Privacy &amp; Security</h2>
          <p className="text-xs np-muted">Your connection privacy status.</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2"><span>IP is Public</span><StatusBadge tone={info.ip ? "ok" : "neutral"}>{info.ip ? `Yes (${info.ip})` : "Not detected"}</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span>Using VPN</span><StatusBadge tone="neutral">Not detected</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span>Using Proxy</span><StatusBadge tone="neutral">Not detected</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span>Using Tor</span><StatusBadge tone="neutral">Not detected</StatusBadge></li>
          </ul>
          <p className="mt-3 text-xs np-muted">VPN/proxy/Tor detection is not available from the lookup provider. “Not detected” here means unavailable, not proof of absence — it never, by itself, means a connection is secure.</p>
        </section>
      </div>
    </div>
  );
}
