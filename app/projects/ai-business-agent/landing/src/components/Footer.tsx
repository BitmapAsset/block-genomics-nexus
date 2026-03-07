import Image from "next/image";
import { Github, Twitter } from "lucide-react";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-[#0A0A0B] border-t border-white/5 py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/favicon.svg"
                alt="Naxora"
                width={24}
                height={24}
              />
              <span className="text-white font-bold tracking-wide">
                NAXORA
              </span>
            </div>
            <p className="text-sm text-white/30 max-w-xs leading-relaxed">
              The autonomous AI brain that runs your business — 24/7, across
              every channel.
            </p>
            <div className="flex gap-3 mt-6">
              <a
                href="#"
                className="text-white/20 hover:text-white/50 transition-colors"
              >
                <Twitter size={18} />
              </a>
              <a
                href="#"
                className="text-white/20 hover:text-white/50 transition-colors"
              >
                <Github size={18} />
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs uppercase tracking-[0.15em] text-white/30 mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-white/30 hover:text-white/60 transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/15">
            © 2026 Naxora. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
