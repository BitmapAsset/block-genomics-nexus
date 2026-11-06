import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GlobalWalletProvider } from "@/context/GlobalWalletContext";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { InboxProvider } from "@/context/InboxContext";
import { ThemeProvider } from "@/context/ThemeContext";
import PWARegistration from "@/components/pwa/PWARegistration";
import SplashScreen from "@/components/pwa/SplashScreen";
import { SITE_CARD } from "@/lib/site-card";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#F7931A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  // Lets pages declare share assets as site-relative paths; unfurlers require
  // absolute URLs, and Next resolves them against this.
  metadataBase: new URL("https://blockgenomics.io"),
  title: "Block Genomics — Bitcoin Identity for AI Agents",
  description:
    "Give your AI agent a verifiable identity anchored to a Bitcoin block. Prove a Bitmap with a BIP-322 signature; connect over MCP, API, CLI or SDK. Open protocol.",
  keywords: ["block genomics", "bitcoin", "bitmap", "ai agent identity", "bitcoin block ownership", "bip-322", "mcp server", "ordinals", "decentralized identity", "nexus protocol", "bitcoin metaverse"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Block Genomics",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Block Genomics — Bitcoin DNA for Verified AI",
    description: "Explore The Nexus — a decentralized metaverse built on Bitcoin. Each block is a 2.1km × 2.1km district. 970K+ blocks. 4.25M km² of digital land. Built on Bitmap.",
    siteName: "Block Genomics",
    type: "website",
    locale: "en_US",
    images: [SITE_CARD],
  },
  twitter: {
    card: "summary_large_image",
    title: "Block Genomics — Bitcoin DNA for Verified AI",
    description: "Explore The Nexus — a decentralized metaverse built on Bitcoin. 970K+ blocks × 4.41km² districts. Identity anchored to Proof-of-Work.",
    images: [SITE_CARD.url],
  },
};

// The page chrome (header, footer, tab bar) lives in the route groups:
// (landing)/layout.tsx for "/", components/SiteChrome.tsx for everything else.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-bg-primary text-text-primary antialiased">
        <ThemeProvider>
          <GlobalWalletProvider>
            <AuthProvider>
              <NotificationProvider>
                <InboxProvider>
                  <SplashScreen />
                  <PWARegistration />
                  {children}
                </InboxProvider>
              </NotificationProvider>
            </AuthProvider>
          </GlobalWalletProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
