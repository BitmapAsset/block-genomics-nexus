"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";

const links = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "/contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/90 backdrop-blur-xl border-b border-gray-200/60 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
        <a href="#" className="flex items-center gap-3">
          <Image src="/favicon.svg" alt="Naxora" width={32} height={32} />
          <span
            className={`font-bold text-lg tracking-wide transition-colors duration-500 ${
              scrolled ? "text-gray-900" : "text-gray-900"
            }`}
          >
            NAXORA
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors duration-300 ${
                scrolled
                  ? "text-gray-500 hover:text-gray-900"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {l.label}
            </a>
          ))}
          <a
            href="#pricing"
            className="gradient-btn px-6 py-2.5 rounded-full text-sm"
          >
            Start Free →
          </a>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={`md:hidden transition-colors ${
            scrolled ? "text-gray-600" : "text-gray-600"
          }`}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white/95 backdrop-blur-xl border-b border-gray-200 overflow-hidden"
          >
            <div className="px-6 py-4 space-y-4">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="block text-gray-600 hover:text-gray-900 text-sm font-medium"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="#pricing"
                onClick={() => setMobileOpen(false)}
                className="block gradient-btn text-center px-5 py-2.5 rounded-full text-sm"
              >
                Start Free →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
