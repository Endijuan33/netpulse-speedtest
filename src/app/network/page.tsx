"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Building2, CheckCircle2, Clock, Cpu, Database, Globe, LocateFixed, MapPin,
  Minus, Monitor, Network, Plus, RadioTower, RefreshCw, Server, Share2,
  ShieldCheck, Signal, XCircle,
} from "lucide-react";
import { PageHeader, InfoCard, Skeleton, ErrorState, StatusBadge } from "@/components/ui";

/**
 * Dark tile map without a mapping library: 3×3 OpenStreetMap standard tiles
 * centred on the provider coordinates, rendered dark via a CSS filter on
 * the tile layer (invert + hue-rotate, the standard keyless dark-mode
 * technique). OSM tiles need no API key, account, or cost, and cannot
 * watermark — unlike the previous CARTO endpoint, which started returning
 * "API KEY REQUIRED" watermark tiles (verified live 2026-10-28). Tiles
 * are real map imagery (© OpenStreetMap contributors), never a screenshot,
 * and coordinates are never hardcoded — they come from the server-side
 * lookup. If tiles fail to load, the Open in Maps link remains.
 */
function DarkTileMap({ lat, lon }: { lat: number; lon: number }) {
  const [zoom, setZoom] = useState(12);
  const [failed, setFailed] = useState(false);
  const n = 2 ** zoom;
  const fx = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const px = (fx - tx) * 256;
  const py = (fy - ty) * 256;
  const tiles = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push({ x: tx + dx, y: ty + dy, dx, dy });
    }
  }
  if (failed) {
    return (
      <p className="mt-4 rounded-lg p-4 text-sm np-muted" style={{ background: "var(--np-elevated)" }}>
        Map tiles could not be loaded in this browser. Use “Open in Maps” for the same approximate location.
      </p>
    );
  }
  return (
    <div className="relative mt-4 h-72 w-full overflow-hidden rounded-lg" style={{ background: "#0b1224" }} role="img" aria-label={`Approximate location map, ${lat}, ${lon}`}>
      <div className="absolute" style={{ left: `calc(50% - ${px}px - 256px)`, top: `calc(50% - ${py}px - 256px)`, width: 768, height: 768, filter: "invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)" }}>
        {tiles.map((t) => (
          <Image
            key={`${t.x}-${t.y}-${zoom}`}
            src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
            alt=""
            width={256}
            height={256}
            unoptimized
            draggable={false}
            onError={() => setFailed(true)}
            style={{ position: "absolute", left: (t.dx + 1) * 256, top: (t.dy + 1) * 256 }}
          />
        ))}
      </div>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-[#00a8ff]" aria-hidden="true">
        <MapPin className="h-8 w-8 fill-[#00a8ff]/40" />
      </span>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(18, z + 1))} className="rounded-md border bg-[#101a30]/90 p-1.5" style={{ borderColor: "var(--np-border)" }}><Plus className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(3, z - 1))} className="rounded-md border bg-[#101a30]/90 p-1.5" style={{ borderColor: "var(--np-border)" }}><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" aria-label="Recentre map" onClick={() => setZoom(12)} className="rounded-md border bg-[#101a30]/90 p-1.5" style={{ borderColor: "var(--np-border)" }}><LocateFixed className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <p className="absolute bottom-1 left-2 text-[10px] text-white/60">© OpenStreetMap contributors</p>
    </div>
  );
}

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
            <InfoCard label="Public IPv4 Address" value={field(info.ip)} copy={info.ip ?? undefined} icon={<Network aria-hidden="true" />} accent="#00a8ff" />
            <InfoCard label="Public IPv6 Address" value={field(info.ipv6)} copy={info.ipv6 ?? undefined} icon={<Network aria-hidden="true" />} accent="#a855f7" />
            <InfoCard label="ISP" value={field(info.isp)} copy={info.isp ?? undefined} icon={<RadioTower aria-hidden="true" />} accent="#00a8ff" />
            <InfoCard label="Organization" value={field(info.org)} copy={info.org ?? undefined} icon={<Building2 aria-hidden="true" />} accent="#a855f7" />
            <InfoCard label="ASN" value={field(info.asn)} copy={info.asn ?? undefined} icon={<Share2 aria-hidden="true" />} accent="#f59e0b" />
            <InfoCard label="ISP Hostname" value={field(info.hostname)} copy={info.hostname ?? undefined} icon={<Server aria-hidden="true" />} accent="#00a8ff" />
            <InfoCard label="Country" value={field(info.country)} icon={<Globe aria-hidden="true" />} accent="#10b981" />
            <InfoCard label="Region" value={field(info.region)} icon={<MapPin aria-hidden="true" />} accent="#a855f7" />
            <InfoCard label="City" value={field(info.city)} icon={<Building2 aria-hidden="true" />} accent="#00a8ff" />
            <InfoCard label="Timezone" value={field(info.timezone)} icon={<Clock aria-hidden="true" />} accent="#f59e0b" />
            <InfoCard label="Approximate Location" value={hasCoords ? `${info.latitude}, ${info.longitude} (approximate, provider-supplied)` : "Not detected"} copy={hasCoords ? `${info.latitude}, ${info.longitude}` : undefined} icon={<MapPin aria-hidden="true" />} accent="#fb7185" />
            <InfoCard label="Effective Connection Type (browser estimate)" value={connType === "unknown" ? "Not detected" : connType} icon={<Signal aria-hidden="true" />} accent="#10b981" />
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
          {hasCoords ? (
            <DarkTileMap lat={info.latitude!} lon={info.longitude!} />
          ) : (
            <p className="mt-4 rounded-lg p-4 text-sm np-muted" style={{ background: "var(--np-elevated)" }}>No coordinates were returned, so no map can be shown.</p>
          )}
          <p className="mt-2 text-[11px] np-muted">Dark map tiles: © OpenStreetMap contributors (standard tiles, rendered dark with a CSS filter — no API key). The previous light OSM iframe embed was blocked by this app&apos;s own Content-Security-Policy (no frame-src), so it rendered as blocked content in some browsers — the tile map fixes that.</p>
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
            <div className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 np-muted"><Globe className="h-4 w-4 text-[#00a8ff]" aria-hidden="true" />Browser</dt><dd className="break-all text-right font-medium">{browser}</dd></div>
            <div className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 np-muted"><Cpu className="h-4 w-4 text-[#a855f7]" aria-hidden="true" />Operating System</dt><dd className="font-medium">{os}</dd></div>
            <div className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 np-muted"><Monitor className="h-4 w-4 text-[#f59e0b]" aria-hidden="true" />Device Type</dt><dd className="font-medium">{device}</dd></div>
          </dl>
          <p className="mt-3 text-xs np-muted">Browser shown as a neutral globe icon — no trademarked browser logo is reproduced.</p>
        </section>
        <section className="np-card p-5" aria-label="Network details">
          <h2 className="font-semibold">Network Details</h2>
          <p className="text-xs np-muted">Only fields genuinely available are shown.</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 np-muted"><Database className="h-4 w-4 text-[#00a8ff]" aria-hidden="true" />Data Source</dt><dd className="font-medium">{field(info.source)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 np-muted"><Building2 className="h-4 w-4 text-[#a855f7]" aria-hidden="true" />Organization source</dt><dd className="font-medium">{info.orgSource ?? "Not detected"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 np-muted"><Server className="h-4 w-4 text-[#f59e0b]" aria-hidden="true" />Hostname source</dt><dd className="font-medium">{info.hostnameSource ?? "Not detected"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 np-muted"><Signal className="h-4 w-4 text-[#10b981]" aria-hidden="true" />Network Latency (approx)</dt><dd className="font-medium">Not detected</dd></div>
          </dl>
        </section>
        <section className="np-card p-5" aria-label="Privacy and security">
          <h2 className="font-semibold">Privacy &amp; Security</h2>
          <p className="text-xs np-muted">Your connection privacy status.</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5">{info.ip ? <CheckCircle2 className="h-4 w-4 text-[#10b981]" aria-hidden="true" /> : <XCircle className="h-4 w-4 text-[#94a3b8]" aria-hidden="true" />}IP is Public</span><StatusBadge tone={info.ip ? "ok" : "neutral"}>{info.ip ? `Yes (${info.ip})` : "Not detected"}</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#94a3b8]" aria-hidden="true" />Using VPN</span><StatusBadge tone="neutral">Not detected</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#94a3b8]" aria-hidden="true" />Using Proxy</span><StatusBadge tone="neutral">Not detected</StatusBadge></li>
            <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#94a3b8]" aria-hidden="true" />Using Tor</span><StatusBadge tone="neutral">Not detected</StatusBadge></li>
          </ul>
          <p className="mt-3 text-xs np-muted">VPN/proxy/Tor detection is not available from the lookup provider. “Not detected” here means unavailable, not proof of absence — it never, by itself, means a connection is secure.</p>
        </section>
      </div>
    </div>
  );
}
