"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { isActivePath } from "@/lib/site-nav";

const stroke = (active: boolean) => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: active ? 2.4 : 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** Phone navigation: the same destinations as the header, minus Developers (in the menu). */
const tabs = [
  {
    href: "/",
    label: "Home",
    icon: (a: boolean) => (
      <svg {...stroke(a)}>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/explore",
    label: "Explore",
    icon: (a: boolean) => (
      <svg {...stroke(a)}>
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  {
    href: "/my-bitmaps",
    label: "My Bitmaps",
    icon: (a: boolean) => (
      <svg {...stroke(a)}>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/nexus",
    label: "World",
    icon: (a: boolean) => (
      <svg {...stroke(a)}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "Account",
    icon: (a: boolean) => (
      <svg {...stroke(a)}>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-bg-primary/90 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : isActivePath(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? "text-bitcoin" : "text-text-secondary"
              }`}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-current" aria-hidden="true" />}
              {tab.icon(active)}
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
