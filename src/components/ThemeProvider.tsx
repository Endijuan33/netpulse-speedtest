"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const stored = localStorage.getItem("netpulse-theme");
    // Premium reference design is dark-first: no stored preference means
    // dark, so first visits match the reference. The toggle still persists.
    const initial: Theme = stored === "dark" || stored === "light" ? stored : "dark";
    setTheme(initial);
    // Always exactly one of dark/light on <html>: light is the base palette
    // (no .light rules needed), but an explicit class makes the state
    // inspectable and keeps the theme-toggle test honest in both directions.
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.classList.toggle("light", initial === "light");
  }, []);
  const toggle = () => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      localStorage.setItem("netpulse-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.classList.toggle("light", next === "light");
      return next;
    });
  };
  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
