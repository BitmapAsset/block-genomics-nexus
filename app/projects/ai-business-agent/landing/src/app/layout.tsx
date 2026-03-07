import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Naxora — Your Business, Autonomously",
  description:
    "The autonomous AI brain that runs your business. Answer calls, book appointments, reply to customers — 24/7, across every channel.",
  keywords: [
    "AI agent",
    "business automation",
    "customer service AI",
    "appointment booking",
    "voice AI",
    "autonomous business",
  ],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Naxora — Your Business, Autonomously",
    description:
      "The autonomous AI brain that runs your business. Answer calls, book appointments, reply to customers — 24/7, across every channel.",
    type: "website",
    siteName: "Naxora",
    images: [{ url: "/favicon.svg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Naxora — Your Business, Autonomously",
    description:
      "The autonomous AI brain that runs your business — 24/7, across every channel.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@700,900&display=swap" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
