import type { Metadata } from "next";
import { GlobalWalletProvider } from "@/context/GlobalWalletContext";
import { AuthProvider } from "@/context/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Block Genomics — Bitcoin DNA for Verified AI",
  description:
    "Anchor AI identity to Bitcoin blocks. Block Genomics turns Bitmaps into digital DNA — scarce, sovereign, and verifiable like SSL for agents. Explore The Nexus — a decentralized metaverse where every Bitcoin block is a 2.1km × 2.1km district of sovereign digital land.",
  keywords: ["bitcoin", "bitmap", "genome", "ai identity", "proof of work", "nexus", "metaverse", "block genomics", "decentralized identity"],
  openGraph: {
    title: "Block Genomics — Bitcoin DNA for Verified AI",
    description: "Explore The Nexus — a decentralized metaverse built on Bitcoin. Each block is a 2.1km × 2.1km district. 880,000 blocks. 3.88M km² of digital land. Built on Bitmap.",
    siteName: "Block Genomics",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Block Genomics — Bitcoin DNA for Verified AI",
    description: "Explore The Nexus — a decentralized metaverse built on Bitcoin. 880,000 blocks × 2.1km² districts. Identity anchored to Proof-of-Work.",
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
      </body>
    </html>
  );
}
