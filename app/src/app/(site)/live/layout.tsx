import type { Metadata } from "next";

// Live streams and events that come and go: nothing stable for a search result.
export const metadata: Metadata = {
  title: "Live in The Nexus — Block Genomics",
  robots: { index: false, follow: true },
};

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
