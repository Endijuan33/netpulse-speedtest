import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "NetPulse — Network Speedtest & Diagnostics",
  description: "Real network speed, latency and diagnostics measurement.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          <div className="np-ambient" aria-hidden="true" />
          <Nav />
          <main className="relative z-10 mx-auto max-w-[1440px] px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-[1440px] px-4 pb-8 text-center text-xs np-muted">
            NetPulse measures real network traffic. Ping is HTTP round-trip latency, not ICMP. Packet loss shown is HTTP request loss, not ICMP packet loss.
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
