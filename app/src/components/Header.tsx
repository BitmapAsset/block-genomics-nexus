"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useGlobalWallet } from "@/context/GlobalWalletContext";
import { PRIMARY_NAV, SECONDARY_NAV, isActivePath } from "@/lib/site-nav";

const WalletConnect = dynamic(() => import("@/components/auth/WalletConnect"), {
  ssr: false,
  loading: () => (
    <button className="inline-flex min-h-[44px] items-center rounded-full border border-accent-cyan/30 bg-accent-cyan/5 px-4 text-sm font-medium text-accent-cyan">
      Connect
    </button>
  ),
});

const GlobalSearch = dynamic(() => import("@/components/GlobalSearch"), {
  ssr: false,
  loading: () => <div className="h-[44px] w-full lg:w-[180px] xl:w-[240px]" />,
});

const NotificationBell = dynamic(() => import("@/components/NotificationBell"), {
  ssr: false,
  loading: () => <div className="h-11 w-11" />,
});

const ThemeToggle = dynamic(() => import("@/components/ThemeToggle"), {
  ssr: false,
  loading: () => <div className="h-11 w-11" />,
});

/**
 * Five destinations, one search, one wallet button. Secondary pages live in the
 * footer and in the "More" group of the menu, so the bar fits a 1024 px laptop
 * and a 390 px phone without scrolling sideways.
 */
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isConnected } = useGlobalWallet();
  const inNexus = pathname === "/nexus" || pathname.startsWith("/nexus/");

  // Close the menu on route change (also covers back/forward).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-500"
      style={
        inNexus
          ? { background: "rgba(2,2,8,0.92)", borderColor: "rgba(0,255,204,0.15)" }
          : { background: "rgba(var(--bg-primary), 0.8)", borderColor: "var(--border)" }
      }
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-h-[44px] shrink-0 items-center" aria-label="Block Genomics home">
          <span
            className="whitespace-nowrap text-lg font-black tracking-tight sm:text-2xl"
            style={{
              background: "linear-gradient(135deg, #00ffcc 0%, #ffffff 30%, #aa44ff 60%, #ff8800 100%)",
              backgroundSize: "200% 200%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Block Genomics
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {PRIMARY_NAV.map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 text-sm transition-colors ${
                  active ? "bg-white/[0.08] font-medium text-text-primary" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden lg:block">
            <GlobalSearch />
          </div>
          {isConnected && (
            <div className="hidden sm:block">
              <NotificationBell />
            </div>
          )}
          <WalletConnect />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-11 w-11 flex-col items-center justify-center gap-[5px] rounded-full hover:bg-white/[0.06] lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
          >
            <span className={`block h-[2px] w-5 bg-text-primary transition-all ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`} />
            <span className={`block h-[2px] w-5 bg-text-primary transition-all ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] w-5 bg-text-primary transition-all ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="site-menu"
          data-mobile-menu
          aria-label="Menu"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/[0.08] bg-bg-primary/95 px-4 pb-6 pt-3 backdrop-blur-xl lg:hidden"
        >
          <div className="pb-3">
            <GlobalSearch />
          </div>
          <ul className="flex flex-col">
            {PRIMARY_NAV.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-[48px] items-center rounded-xl px-3 text-base ${
                      active ? "bg-white/[0.07] font-medium text-text-primary" : "text-text-primary hover:bg-white/[0.04]"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-text-secondary">More</p>
          <ul className="mt-1 grid grid-cols-2">
            {SECONDARY_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-[44px] items-center rounded-xl px-3 text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between rounded-xl px-3">
            <span className="text-sm text-text-secondary">Appearance</span>
            <ThemeToggle />
          </div>
        </nav>
      )}
    </header>
  );
}
