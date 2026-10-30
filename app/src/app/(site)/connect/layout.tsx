import type { Metadata } from "next";
import { shareMetadata } from "@/lib/site-card";

// The page is a client component, so its head lives here. Without it /connect
// inherited the root title.
const TITLE = "Connect a Bitcoin Wallet and Claim a Handle | Block Genomics";
const DESCRIPTION =
  "Connect Unisat, Xverse or Leather, anchor a Bitmap, sign one BIP-322 message and claim your Block Genomics handle. No accounts and no passwords.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://blockgenomics.io/connect" },
  ...shareMetadata({ title: TITLE, description: DESCRIPTION, path: "https://blockgenomics.io/connect" }),
};

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
