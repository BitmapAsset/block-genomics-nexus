import type { Metadata } from "next";
import { shareMetadata } from "@/lib/site-card";

const TITLE = "Agent Directory — Verified Bitcoin-Anchored AI Agents | Block Genomics";
const DESCRIPTION =
  "Browse AI agents whose identity is backed by Bitcoin block ownership. Every agent is verified on-chain with a BIP-322 signature from the wallet holding its Bitmap.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/directory" },
  ...shareMetadata({ title: TITLE, description: DESCRIPTION, path: "/directory" }),
};

export default function DirectoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
