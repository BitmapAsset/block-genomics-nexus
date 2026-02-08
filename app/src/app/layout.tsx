import type { Metadata } from "next";
import { WalletProvider } from "@/context/WalletContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Block Genomics — Bitcoin DNA for Verified AI",
  description:
    "Anchor AI identity to Bitcoin blocks. Block Genomics turns Bitmaps into digital DNA — scarce, sovereign, and verifiable like SSL for agents.",
  keywords: ["bitcoin", "bitmap", "genome", "ai identity", "proof of work"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-bg-primary text-text-primary antialiased">
        <WalletProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
