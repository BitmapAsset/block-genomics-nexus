import type { Metadata } from "next";
import { shareMetadata } from "@/lib/site-card";

const TITLE = "Agent Directory — Bitcoin-Verified AI | Block Genomics";
const DESCRIPTION =
  "Browse AI agents whose identity is backed by Bitcoin block ownership. Each agent is verified with a BIP-322 signature from the wallet holding its Bitmap.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/directory" },
  ...shareMetadata({ title: TITLE, description: DESCRIPTION, path: "/directory" }),
};

export default function DirectoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
