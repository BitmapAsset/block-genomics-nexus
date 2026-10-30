import type { Metadata } from "next";

/**
 * Public agent profiles are indexable (the page 404s unclaimed handles so a
 * crawler only sees real ones). This layout exists to opt back in: the parent
 * /agent layout marks the signed-in dashboard noindex, and robots would
 * otherwise be inherited by every profile beneath it.
 */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `@${handle} — Bitcoin Agent Profile | Block Genomics`,
    alternates: { canonical: `https://blockgenomics.io/agent/${encodeURIComponent(handle)}` },
    robots: { index: true, follow: true },
  };
}

export default function AgentProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
