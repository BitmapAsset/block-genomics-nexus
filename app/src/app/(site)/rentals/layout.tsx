import type { Metadata } from "next";
import { shareMetadata } from "@/lib/site-card";

const TITLE = "Parcel Rentals — Rent Bitcoin Block Land | Block Genomics";
const DESCRIPTION =
  "Browse Bitcoin blocks and parcels available for rent in The Nexus, the Block Genomics map of sovereign digital land anchored to Bitmap ownership.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/rentals" },
  ...shareMetadata({ title: TITLE, description: DESCRIPTION, path: "/rentals" }),
};

export default function RentalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
