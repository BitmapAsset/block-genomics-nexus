import type { Metadata } from "next";
import WhitePaperClient from "./whitepaper-client";

export const metadata: Metadata = {
  title: "White Paper — Block Genomics",
  description:
    "Block Genomics: An open-source protocol anchoring AI identity to Bitcoin's Proof-of-Work. Digital DNA for agents and humans.",
};

export default function WhitePaperPage() {
  return <WhitePaperClient />;
}
