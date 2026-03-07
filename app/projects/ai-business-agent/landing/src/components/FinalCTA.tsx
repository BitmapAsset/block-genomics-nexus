"use client";
import AnimatedDiv from "./AnimatedDiv";

export default function FinalCTA() {
  return (
    <section className="relative bg-gradient-to-b from-white to-[#f8f9fb] py-32 overflow-hidden">
      {/* Subtle gradient orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-cyan/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <AnimatedDiv>
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight leading-tight text-gray-900"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Ready to put your business on{" "}
            <span className="gradient-text">autopilot?</span>
          </h2>
          <p className="mt-6 text-gray-500 text-lg">
            No credit card required. Free forever plan available.
          </p>
          <div className="mt-10">
            <a
              href="#pricing"
              className="gradient-btn inline-block px-10 py-4 rounded-full text-lg font-semibold shadow-lg"
            >
              Start Free →
            </a>
          </div>
        </AnimatedDiv>
      </div>
    </section>
  );
}
