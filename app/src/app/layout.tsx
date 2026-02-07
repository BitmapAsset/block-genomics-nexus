import type { Metadata } from "next";
import { WalletProvider } from "@/context/WalletContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Block Genomics — Bitcoin Block Verification",
  description:
    "Decentralized Bitcoin block verification through cryptographic genome extraction and trust-scored agents.",
  keywords: ["bitcoin", "block", "verification", "genome", "cryptographic"],
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
