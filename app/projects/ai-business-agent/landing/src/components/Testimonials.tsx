"use client";
import AnimatedDiv from "./AnimatedDiv";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Maria Chen",
    role: "Owner, Golden Dragon Restaurant",
    text: "Naxora handles 200+ reservation calls a week. Our no-show rate dropped 40% because the AI confirms every booking automatically. It paid for itself in the first week.",
    stars: 5,
  },
  {
    name: "James Walker",
    role: "Founder, Luxe Hair Studio",
    text: "We were missing 30% of calls during busy hours. Now Naxora books appointments 24/7 across WhatsApp and phone. Revenue is up 25% and I actually take weekends off.",
    stars: 5,
  },
  {
    name: "Dr. Sarah Mitchell",
    role: "Director, Bright Smile Dental",
    text: "The AI handles patient inquiries, insurance questions, and scheduling across all channels. My front desk staff can finally focus on in-office patients. Game changer.",
    stars: 5,
  },
];

export default function Testimonials() {
  return (
    <section className="relative bg-[#0A0A0B] py-32 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <AnimatedDiv className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan mb-4 font-semibold">
            Testimonials
          </p>
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Loved by <span className="gradient-text">businesses.</span>
          </h2>
        </AnimatedDiv>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <AnimatedDiv key={t.name} delay={i * 0.1}>
              <div className="glass-card rounded-2xl p-8 h-full flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star
                      key={j}
                      size={14}
                      className="text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-sm text-white/60 leading-relaxed flex-1 mb-6">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-white/30">{t.role}</p>
                </div>
              </div>
            </AnimatedDiv>
          ))}
        </div>
      </div>
    </section>
  );
}
