"use client";
import { motion } from "framer-motion";
import AnimatedDiv from "./AnimatedDiv";
import { Phone, MessageCircle, Mail, Globe, MessageSquare } from "lucide-react";

const channels = [
  { icon: Phone, label: "Phone", angle: -60 },
  { icon: MessageCircle, label: "WhatsApp", angle: -30 },
  { icon: MessageSquare, label: "SMS", angle: 0 },
  { icon: Mail, label: "Email", angle: 30 },
  { icon: Globe, label: "Web Widget", angle: 60 },
];

export default function TheBrain() {
  return (
    <section className="relative bg-[#0A0A0B] py-32 overflow-hidden noise-overlay">
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <AnimatedDiv>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan mb-4">
            The Brain
          </p>
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            One brain.{" "}
            <span className="gradient-text">Every channel.</span>
          </h2>
          <p className="mt-6 text-white/40 text-lg max-w-xl mx-auto">
            A single AI that unifies every customer touchpoint into one
            intelligent experience.
          </p>
        </AnimatedDiv>

        <AnimatedDiv delay={0.2} className="mt-16 relative">
          {/* Central hub — large, fills 80% of space */}
          <div className="relative mx-auto w-[420px] h-[420px] md:w-[520px] md:h-[520px]">
            {/* Outer ring glow */}
            <div className="absolute inset-0 bg-cyan/5 rounded-full blur-[100px]" />
            {/* Orbit ring */}
            <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
            <div className="absolute inset-6 rounded-full border border-white/[0.04]" />
            {/* Center circle */}
            <div className="absolute inset-[25%] glass-card rounded-full flex items-center justify-center border border-cyan/20 shadow-[0_0_60px_rgba(0,207,255,0.15)]">
              <div className="text-center">
                <div className="gradient-text text-5xl md:text-6xl font-bold">И</div>
                <div className="text-white/40 text-sm mt-2 tracking-wider">Naxora</div>
              </div>
            </div>

            {/* Connection lines from center to each channel */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 520 520">
              {channels.map((ch) => {
                const rad = (ch.angle * Math.PI) / 180;
                const r = 230;
                const cx = 260, cy = 260;
                const ex = cx + Math.sin(rad) * r;
                const ey = cy - Math.cos(rad) * r;
                return (
                  <line
                    key={ch.label}
                    x1={cx} y1={cy} x2={ex} y2={ey}
                    stroke="url(#lineGrad)" strokeWidth="1" opacity="0.2"
                  />
                );
              })}
              <defs>
                <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00CFFF" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.2" />
                </linearGradient>
              </defs>
            </svg>

            {/* Channel nodes */}
            {channels.map((ch, i) => {
              const Icon = ch.icon;
              const rad = (ch.angle * Math.PI) / 180;
              const r = 210;
              const rMd = 240;
              return (
                <motion.div
                  key={ch.label}
                  initial={{ opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 200 }}
                  className="absolute glass-card rounded-2xl p-4 md:p-5 flex flex-col items-center gap-2 border border-white/[0.08] hover:border-cyan/30 transition-colors"
                  style={{
                    left: `calc(50% + ${Math.sin(rad) * r}px - 36px)`,
                    top: `calc(50% + ${-Math.cos(rad) * r}px - 36px)`,
                  }}
                >
                  <Icon size={22} className="text-cyan" />
                  <span className="text-xs text-white/50 font-medium">{ch.label}</span>
                </motion.div>
              );
            })}

            {/* Subtle animated pulse on center */}
            <motion.div
              className="absolute inset-[25%] rounded-full border border-cyan/10"
              animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </AnimatedDiv>
      </div>
    </section>
  );
}
