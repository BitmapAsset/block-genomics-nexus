"use client";
import AnimatedDiv from "./AnimatedDiv";
import { Plug, Rocket, Coffee } from "lucide-react";

const steps = [
  {
    num: "01",
    icon: Plug,
    title: "Connect",
    desc: "5-minute setup. Plug in your business info, upload your knowledge base, configure your agents.",
  },
  {
    num: "02",
    icon: Rocket,
    title: "Deploy",
    desc: "Activate on phone, web, WhatsApp, email — go live across every channel instantly.",
  },
  {
    num: "03",
    icon: Coffee,
    title: "Relax",
    desc: "Naxora handles your customers autonomously while you focus on growing your business.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative bg-white py-32 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-6">
        <AnimatedDiv className="text-center mb-20">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan mb-4 font-semibold">
            How It Works
          </p>
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Three steps to{" "}
            <span className="gradient-text">autopilot.</span>
          </h2>
        </AnimatedDiv>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-cyan/20 via-purple/20 to-cyan/20" />

          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <AnimatedDiv key={s.title} delay={i * 0.15} className="text-center">
                <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white border border-gray-200 shadow-sm mb-6">
                  <Icon size={28} className="text-cyan" />
                  <span className="absolute -top-2 -right-2 text-[10px] font-bold text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                    {s.num}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {s.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                  {s.desc}
                </p>
              </AnimatedDiv>
            );
          })}
        </div>
      </div>
    </section>
  );
}
