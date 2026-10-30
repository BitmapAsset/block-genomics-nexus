import type { Metadata } from "next";

// The service worker's offline fallback: never a search result.
export const metadata: Metadata = {
  title: "Offline — Block Genomics",
  robots: { index: false, follow: true },
};

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
