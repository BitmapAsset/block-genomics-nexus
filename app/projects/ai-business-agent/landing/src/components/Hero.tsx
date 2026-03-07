"use client";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useState, useEffect } from "react";

const slides = [
  {
    headline: "Fire your busywork.",
    sub: "The AI team that runs your business while you sleep.",
  },
  {
    headline: "Meet your AI workforce.",
    sub: "They answer calls. Book appointments. Close deals. You just watch it grow.",
  },
  {
    headline: "One hire. Every role.",
    sub: "Naxora deploys an AI team across every channel — phone, text, email, chat — in minutes.",
  },
];

export default function Hero() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-white via-[#f0f7ff] to-white">
      {/* Subtle gradient orbs */}
      <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-cyan/[0.06] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 left-1/4 w-[400px] h-[400px] bg-purple/[0.06] rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-36 pb-20">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <Image
            src="/logo-icon.svg"
            alt="Naxora"
            width={64}
            height={64}
            className="mx-auto"
          />
        </motion.div>

        {/* Rotating Headline */}
        <div className="h-[180px] sm:h-[160px] md:h-[180px] lg:h-[200px] flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <h1
                className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <span className="gradient-text">{slides[current].headline}</span>
              </h1>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Rotating Subtitle */}
        <div className="h-[80px] sm:h-[70px] flex items-start justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={current}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
              className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed"
            >
              {slides[current].sub}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Slide indicators */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === current
                  ? "w-8 bg-gradient-to-r from-cyan to-purple"
                  : "w-1.5 bg-gray-300 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#pricing"
            className="gradient-btn px-8 py-4 rounded-full text-base font-semibold shadow-lg"
          >
            Start Free →
          </a>
          <a
            href="#how-it-works"
            className="px-8 py-4 rounded-full text-base font-semibold text-gray-600 border border-gray-200 hover:border-gray-300 hover:text-gray-900 hover:shadow-sm transition-all bg-white"
          >
            Watch Demo
          </a>
        </motion.div>

        {/* Trust bar */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="mt-10 text-sm text-gray-400 tracking-wide"
        >
          Powering 500+ businesses worldwide
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="mt-8 text-xs text-gray-300 animate-bounce"
        >
          ↓ Scroll to see the Brain in action
        </motion.p>
      </div>
    </section>
  );
}
