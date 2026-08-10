import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GlobalWalletProvider } from "@/context/GlobalWalletContext";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { InboxProvider } from "@/context/InboxContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Header from "@/components/Header";
import OnboardingFlow from "@/components/OnboardingFlow";
import Footer from "@/components/Footer";
import NotificationBanner from "@/components/NotificationBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageTransition from "@/components/PageTransition";
import PWARegistration from "@/components/pwa/PWARegistration";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import BottomTabBar from "@/components/pwa/BottomTabBar";
import SplashScreen from "@/components/pwa/SplashScreen";
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
  title: "Block Genomics — Bitcoin DNA for Verified AI",
  description:
    "Anchor AI identity to Bitcoin blocks. Block Genomics turns Bitmaps into digital DNA — scarce, sovereign, and verifiable like SSL for agents. Explore The Nexus — a decentralized metaverse where every Bitcoin block is a 2.1km × 2.1km district of sovereign digital land.",
  keywords: ["bitcoin", "bitmap", "genome", "ai identity", "proof of work", "nexus", "metaverse", "block genomics", "decentralized identity"],
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
        <ThemeProvider>
          <GlobalWalletProvider>
            <AuthProvider>
              <NotificationProvider>
                <InboxProvider>
                  <SplashScreen />
                  <PWARegistration />
                  <Header />
                  <NotificationBanner />
                  <main className="flex-1 pb-16 md:pb-0">
                    <ErrorBoundary>
                      <PageTransition>{children}</PageTransition>
                    </ErrorBoundary>
                  </main>
                  <Footer className="hidden md:block" />
                  <BottomTabBar />
                  <InstallPrompt />
                  <OnboardingFlow />
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
