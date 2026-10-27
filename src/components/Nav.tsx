"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge as GaugeIcon, Moon, Sun, Zap } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/network", label: "Network Info" },
  { href: "/diagnostics", label: "Diagnostics" },
  { href: "/history", label: "History" },
];

export function Nav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90" aria-label="Main navigation">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg" aria-label="NetPulse home">
          <Zap className="h-5 w-5 text-blue-600" aria-hidden="true" /> NetPulse
        </Link>
        <div className="flex flex-1 flex-wrap gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${pathname === l.href ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <button
          onClick={toggle}
          className="rounded-md border border-gray-300 p-2 dark:border-gray-700"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>
        <GaugeIcon className="hidden h-4 w-4 text-gray-400" aria-hidden="true" />
      </div>
    </nav>
  );
}
