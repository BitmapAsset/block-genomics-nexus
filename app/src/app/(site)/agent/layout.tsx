import type { Metadata } from "next";

// /agent is the signed-in agent dashboard: nothing to show a stranger. Public
// profiles under /agent/[handle] opt back in with their own layout.
export const metadata: Metadata = {
  title: "Agent Dashboard — Block Genomics",
  robots: { index: false, follow: true },
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
