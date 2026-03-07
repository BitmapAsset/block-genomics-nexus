"use client";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Check } from "lucide-react";
import Link from "next/link";

const platforms = [
  {
    name: "macOS",
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    ),
    label: "Download for macOS",
    sub: "Intel & Apple Silicon • .dmg",
    href: "https://naxora.ai/downloads/Naxora-0.1.0-arm64.dmg",
  },
  {
    name: "Windows",
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
        <path d="M3 12V6.75l8-1.25V12H3zm0 .5h8v6.5l-8-1.25V12.5zM11.5 12V5.35l9.5-1.6V12H11.5zm0 .5h9.5v8.25l-9.5-1.6V12.5z" />
      </svg>
    ),
    label: "Download for Windows",
    sub: "Windows 10+ • Coming soon",
    href: "#coming-soon",
  },
  {
    name: "Linux",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.43.868.134 1.703-.272 2.191-.574.3-.18.599-.306.9-.36.298-.042.586-.077.893-.39.06-.06.098-.154.116-.2.49-.985.044-2.926-.213-4.307-.163-.882-.374-1.613-.93-2.403l-.066-.084c.163-.166.3-.377.41-.547.2-.323.328-.668.328-1.05 0-.379-.129-.75-.337-1.093-.1-.173-.218-.298-.334-.449a.51.51 0 00-.04-.044c.005-.016.005-.047.005-.063 0-.085-.018-.183-.04-.282-.216-.852-1.19-3.37-2.106-4.32-.72-.752-1.295-1.236-1.846-1.637a5.035 5.035 0 00-.953-.538c-.35-.147-.734-.254-1.158-.257zm-.02.286c.387.003.735.101 1.061.24.327.14.634.33.923.512.573.365 1.106.876 1.86 1.666.836.875 1.86 3.398 2.065 4.203.013.06.023.115.023.16l.001.021a.553.553 0 01-.021.128.4.4 0 01-.1.18l-.076.08-.044.06c.067.114.154.23.24.37.175.296.287.604.287.926s-.111.603-.3.897c-.145.236-.327.48-.527.66l.071.094c.527.75.746 1.45.905 2.309.244 1.31.681 3.186.255 4.06-.013.02-.035.035-.05.057-.215.195-.396.18-.677.22-.318.063-.662.2-.993.4-.46.284-1.237.672-1.999.553-.647-.054-1.272-.555-1.607-1.21v-.003c-.046-.121-.08-.221-.1-.338l-.018-.164-.026.009c-.992.078-1.94-.267-2.647-.2-1.072.069-1.656.348-2.203.343h-.06l-.04.07c-.199.428-.566.72-1.02.822-.652.168-1.52-.008-2.395-.45-.912-.499-2.074-.378-2.8-.566-.363-.114-.602-.22-.724-.45-.124-.232-.102-.636.155-1.318l.009-.03-.004-.026c-.104-.326-.032-.702-.091-1.105-.029-.146-.057-.331-.057-.523a1.07 1.07 0 01.108-.47c.144-.294.39-.396.692-.528.302-.128.64-.214.893-.47l.072-.08a.39.39 0 00.085-.105c-.138-.758-.015-1.556.254-2.36.568-1.706 1.783-3.37 2.64-4.399.77-1.1 1.01-2.011 1.088-3.12.05-1.065-.086-3.198.73-4.928.513-1.087 1.34-1.788 2.51-1.884.15-.013.3-.02.442-.019z" />
      </svg>
    ),
    label: "Download for Linux",
    sub: "Ubuntu, Debian, Fedora • Coming soon",
    href: "#coming-soon",
  },
];

const freeFeatures = [
  "50 conversations per month",
  "2 AI agents",
  "1 channel (website widget)",
  "Knowledge base",
  "Naxora Brain onboarding",
];

const comparisonRows = [
  { feature: "Conversations/month", free: "50", starter: "1,000", pro: "10,000", enterprise: "Unlimited" },
  { feature: "AI Agents", free: "2", starter: "3", pro: "5", enterprise: "Unlimited" },
  { feature: "Channels", free: "1", starter: "3", pro: "All + Voice", enterprise: "All + Custom" },
  { feature: "Knowledge Base", free: "✓", starter: "✓", pro: "✓", enterprise: "✓" },
  { feature: "Analytics", free: "—", starter: "Basic", pro: "Advanced", enterprise: "Custom" },
  { feature: "Approval Queue", free: "—", starter: "—", pro: "✓", enterprise: "✓" },
  { feature: "Priority Support", free: "—", starter: "—", pro: "✓", enterprise: "✓" },
  { feature: "Custom AI Models", free: "—", starter: "—", pro: "—", enterprise: "✓" },
  { feature: "Price", free: "Free", starter: "$99/mo", pro: "$299/mo", enterprise: "$499/mo" },
];

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Download <span className="gradient-text">Naxora</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-xl text-gray-500"
          >
            Your AI business team, running on your machine.
          </motion.p>

          {/* Download buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto"
          >
            {platforms.map((p) => (
              <a
                key={p.name}
                href={p.href}
                className="group flex flex-col items-center gap-3 p-6 rounded-2xl border border-gray-200 hover:border-cyan/40 hover:shadow-lg hover:shadow-cyan/5 transition-all"
              >
                <div className="text-gray-700 group-hover:text-cyan transition-colors">
                  {p.icon}
                </div>
                <span className="font-semibold text-gray-900">{p.label}</span>
                <span className="text-xs text-gray-400">{p.sub}</span>
              </a>
            ))}
          </motion.div>

          <p className="mt-6 text-sm text-gray-400">
            v1.0.0 • Free to download • No credit card required
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Or try the web version at{" "}
            <a href="https://app.naxora.ai" className="gradient-text hover:underline">
              app.naxora.ai
            </a>
          </p>
        </div>
      </section>

      {/* Free tier features */}
      <section className="py-20 bg-gray-50 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="text-3xl md:text-4xl font-bold text-gray-900 mb-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            What you get with the <span className="gradient-text">Free tier</span>
          </h2>
          <p className="text-gray-500 mb-10">Everything you need to get started. No strings attached.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-md mx-auto">
            {freeFeatures.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <Check size={18} className="text-cyan shrink-0" />
                <span className="text-gray-700 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Compare <span className="gradient-text">plans</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4 text-gray-500 font-medium">Feature</th>
                  <th className="py-4 px-4 text-gray-900 font-semibold">Free</th>
                  <th className="py-4 px-4 text-gray-900 font-semibold">Starter</th>
                  <th className="py-4 px-4 font-semibold">
                    <span className="gradient-text">Professional</span>
                  </th>
                  <th className="py-4 px-4 text-gray-900 font-semibold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-gray-700 font-medium">{row.feature}</td>
                    <td className="py-3 px-4 text-center text-gray-500">{row.free}</td>
                    <td className="py-3 px-4 text-center text-gray-500">{row.starter}</td>
                    <td className="py-3 px-4 text-center text-gray-700 font-medium">{row.pro}</td>
                    <td className="py-3 px-4 text-center text-gray-500">{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* System requirements */}
      <section className="py-16 bg-gray-50 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h3
            className="text-2xl font-bold text-gray-900 mb-6"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            System Requirements
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-gray-600">
            <div className="p-4 rounded-xl border border-gray-200 bg-white">
              <p className="font-semibold text-gray-900 mb-1">RAM</p>
              <p>4 GB minimum</p>
            </div>
            <div className="p-4 rounded-xl border border-gray-200 bg-white">
              <p className="font-semibold text-gray-900 mb-1">Disk Space</p>
              <p>2 GB free</p>
            </div>
            <div className="p-4 rounded-xl border border-gray-200 bg-white">
              <p className="font-semibold text-gray-900 mb-1">OS</p>
              <p>macOS 12+, Win 10+, Ubuntu 20+</p>
            </div>
          </div>
        </div>
      </section>

      {/* Already have Naxora */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-gray-500 text-lg">
            Already have Naxora?{" "}
            <span className="gradient-text font-semibold">Upgrade anytime from within the app.</span>
          </p>
          <Link
            href="/#pricing"
            className="inline-block mt-4 gradient-btn px-8 py-3 rounded-full text-sm"
          >
            View Pricing →
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
