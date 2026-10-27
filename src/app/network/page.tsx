"use client";

import { useEffect, useState } from "react";

interface Info {
  ip: string | null; ipv6: string | null; isp: string | null; org: string | null; asn: string | null;
  hostname: string | null; country: string | null; region: string | null; city: string | null;
  timezone: string | null; latitude: number | null; longitude: number | null; source: string | null; unavailable: string[];
}

function field(v: string | number | null): string {
  return v === null || v === undefined || v === "" ? "Not detected" : String(v);
}

export default function NetworkPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState(false);
  const [browser, setBrowser] = useState("unknown");
  const [os, setOs] = useState("unknown");
  const [device, setDevice] = useState("unknown");
  const [connType, setConnType] = useState("unknown");

  useEffect(() => {
    fetch("/api/network-info").then((r) => r.json()).then(setInfo).catch(() => setError(true));
    const ua = navigator.userAgent;
    const uaData = (navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }).userAgentData;
    setBrowser(uaData?.brands?.map((b) => `${b.brand} ${b.version}`).join(", ") ?? ua);
    setOs(/Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown");
    setDevice(/Mobi/.test(ua) ? "Mobile" : /Tablet|iPad/.test(ua) ? "Tablet" : "Desktop");
    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
    setConnType(nav.connection?.effectiveType ?? "unknown");
  }, []);

  if (error) return <p role="alert" className="rounded-md bg-red-50 p-4 text-red-700">Network info could not be loaded.</p>;
  if (!info) return <div className="animate-pulse space-y-3" aria-label="Loading network info"><div className="h-6 rounded bg-gray-200 dark:bg-gray-800" /><div className="h-6 rounded bg-gray-200 dark:bg-gray-800" /><div className="h-6 rounded bg-gray-200 dark:bg-gray-800" /></div>;

  const rows: [string, string][] = [
    ["Public IPv4", field(info.ip)],
    ["Public IPv6", field(info.ipv6)],
    ["ISP", field(info.isp)],
    ["Organization", field(info.org)],
    ["ASN", field(info.asn)],
    ["ISP hostname", field(info.hostname)],
    ["Country", field(info.country)],
    ["Region", field(info.region)],
    ["City", field(info.city)],
    ["Timezone", field(info.timezone)],
    ["Approximate location", info.latitude !== null && info.longitude !== null ? `${info.latitude}, ${info.longitude} (approximate, provider-supplied)` : "Not detected"],
    ["Connection type", connType],
    ["Browser", browser],
    ["Operating system", os],
    ["Device type", device],
    ["Data source", field(info.source)],
  ];
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900" aria-label="Network information">
      <h1 className="text-2xl font-bold">Network Information</h1>
      <p className="text-sm text-gray-500">Values come from the server-side lookup provider. Anything not returned is shown as &quot;Not detected&quot; — never invented.</p>
      {info.unavailable.length > 0 && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300" role="status">Unavailable: {info.unavailable.join(", ")} (private/loopback IP or provider failure).</p>}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"><dt className="text-xs text-gray-500">{k}</dt><dd className="font-medium break-all">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}
