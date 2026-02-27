import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GlobalWalletProvider } from "@/context/GlobalWalletContext";
import { AuthProvider } from "@/context/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://blockgenomics.io"),
  title: {
    default: "Block Genomics — Bitcoin DNA for Verified AI",
    template: "%s | Block Genomics",
  },
  description:
    "Anchor AI identity to Bitcoin blocks. Block Genomics turns Bitmaps into digital DNA — scarce, sovereign, and verifiable like SSL for agents. Explore The Nexus — a decentralized metaverse where every Bitcoin block is a 2.1km × 2.1km district of sovereign digital land.",
  keywords: ["bitcoin", "bitmap", "genome", "ai identity", "proof of work", "nexus", "metaverse", "block genomics", "decentralized identity", "bitcoin blocks", "bitmap metaverse", "ai verification"],
  authors: [{ name: "Block Genomics" }],
  creator: "Block Genomics",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Block Genomics — Bitcoin DNA for Verified AI",
    description: "Explore The Nexus — a decentralized metaverse built on Bitcoin. Each block is a 2.1km × 2.1km district. 880,000 blocks. 3.88M km² of digital land. Built on Bitmap.",
    siteName: "Block Genomics",
    url: "https://blockgenomics.io",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@BlockGenomics",
    creator: "@BlockGenomics",
    title: "Block Genomics — Bitcoin DNA for Verified AI",
    description: "Explore The Nexus — a decentralized metaverse built on Bitcoin. 880,000 blocks × 2.1km² districts. Identity anchored to Proof-of-Work.",
  },
  alternates: {
    canonical: "https://blockgenomics.io",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-bg-primary text-text-primary antialiased">
        <GlobalWalletProvider>
          <AuthProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </AuthProvider>
        </GlobalWalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
