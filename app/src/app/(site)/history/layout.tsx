import type { Metadata } from "next";

// Per-wallet activity timeline: nothing here for a search result.
export const metadata: Metadata = {
  title: "Transaction History — Block Genomics",
  robots: { index: false, follow: true },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
