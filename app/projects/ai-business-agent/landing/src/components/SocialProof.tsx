"use client";
import AnimatedDiv from "./AnimatedDiv";

const logos = ["Acme Corp", "Vertex", "Nova Labs", "Prism", "Atlas AI", "Quantum"];

export default function SocialProof() {
  return (
    <section className="relative bg-white py-16 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-6">
        <AnimatedDiv className="text-center mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
            Trusted by teams at
          </p>
        </AnimatedDiv>
        <AnimatedDiv delay={0.1}>
          <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16">
            {logos.map((name) => (
              <span
                key={name}
                className="text-gray-300 font-bold text-lg tracking-wider"
              >
                {name}
              </span>
            ))}
          </div>
        </AnimatedDiv>
      </div>
    </section>
  );
}
