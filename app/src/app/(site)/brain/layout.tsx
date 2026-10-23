import type { Metadata } from "next";
import { shareMetadata } from "@/lib/site-card";

// The page is a client component, so its share text lives here.
const title = "The Nexus Brain — Block Genomics";
const description =
  "The Nexus's autonomous moral guardian, with its soul inscribed on Bitcoin. Read its code, check its live status, and ask it questions.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/brain" },
  ...shareMetadata({ title, description, path: "/brain" }),
};

export default function BrainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
