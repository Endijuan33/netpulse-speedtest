"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun, Zap } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/network", label: "Network Info" },
  { href: "/diagnostics", label: "Diagnostics" },
  { href: "/history", label: "History" },
];

/**
 * Premium application shell navigation (reference layout): logo left,
 * page links centre-left with a blue active pill, theme toggle right.
 * No profile control: this deployment has no accounts, so a decorative
 * avatar button would be a dead control. Mobile: links wrap below the
 * logo row instead of overflowing horizontally.
 */
export function Nav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  return (
    <nav
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--np-bg-2) 92%, transparent)", borderColor: "var(--np-border)" }}
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold" aria-label="NetPulse home">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#2563ff] to-[#00a8ff] text-white" aria-hidden="true">
            <Zap className="h-4 w-4" />
          </span>
          NetPulse
        </Link>
        <div className="flex flex-1 flex-wrap gap-1" role="list">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${pathname === l.href ? "bg-[#2563ff] text-white" : "np-muted hover:text-white"}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <button
          onClick={toggle}
          className="rounded-full border p-2"
          style={{ borderColor: "var(--np-border)" }}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </nav>
  );
}
