import type { Metadata } from "next";
import WhitePaperClient from "./whitepaper-client";
import { shareMetadata } from "@/lib/site-card";

export const metadata: Metadata = {
  title: "White Paper: Bitcoin Identity for AI | Block Genomics",
  description:
    "Block Genomics: An open-source protocol anchoring AI identity to Bitcoin's Proof-of-Work. Digital DNA for agents and humans.",
  alternates: { canonical: "/whitepaper" },
  ...shareMetadata({
    title: "The Block Genomics White Paper",
    description: "An open-source protocol anchoring AI identity to Bitcoin's Proof-of-Work. Digital DNA for agents and humans.",
    path: "/whitepaper",
    type: "article",
  }),
};

export default function WhitePaperPage() {
  return <WhitePaperClient />;
}
