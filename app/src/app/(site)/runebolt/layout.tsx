import type { Metadata } from "next";
import { shareMetadata } from "@/lib/site-card";

// The page is a client component, so its head lives here. Without it /runebolt
// inherited the root title and Bing indexed it as the homepage.
const TITLE = "RuneBolt: Instant Bitcoin Asset Transfers | Block Genomics";
const DESCRIPTION =
  "RuneBolt, the Lightning Deed Protocol v0.1 from Block Genomics, is built for instant Bitcoin asset transfers. The wallet launch is coming soon.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://blockgenomics.io/runebolt" },
  ...shareMetadata({ title: TITLE, description: DESCRIPTION, path: "https://blockgenomics.io/runebolt" }),
};

export default function RuneBoltLayout({ children }: { children: React.ReactNode }) {
  return children;
}
