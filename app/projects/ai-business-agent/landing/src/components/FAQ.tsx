"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedDiv from "./AnimatedDiv";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "How quickly can I set up Naxora?",
    a: "Most businesses are live within 5 minutes. Upload your business info, configure your agents, and deploy across all channels instantly.",
  },
  {
    q: "Does it really sound natural on phone calls?",
    a: "Yes. Naxora uses state-of-the-art voice AI that handles natural conversation, understands context, manages interruptions, and sounds remarkably human.",
  },
  {
    q: "Can I use my own AI API keys?",
    a: "Absolutely. Naxora supports BYOK (Bring Your Own Key) for OpenAI, Anthropic, and other providers. Use our included AI or plug in your own.",
  },
  {
    q: "What channels does Naxora support?",
    a: "Phone/Voice, WhatsApp, SMS, Email, and an embeddable Web Widget. All channels are unified under one AI brain — no separate configurations needed.",
  },
  {
    q: "How does the approval queue work?",
    a: "You set autonomy levels per agent. For sensitive actions (refunds, cancellations), the AI queues them for your approval. You stay in control of what matters.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes! The Free plan includes 1 AI agent, 50 conversations per month, and the web widget. No credit card required. Upgrade whenever you're ready.",
  },
  {
    q: "Can I pay with Bitcoin?",
    a: "Yes. We accept Lightning Network and on-chain Bitcoin payments with a 10% discount on all paid plans.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="relative bg-white py-32 overflow-hidden">
      <div className="max-w-3xl mx-auto px-6">
        <AnimatedDiv className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan mb-4 font-semibold">
            FAQ
          </p>
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Questions?{" "}
            <span className="gradient-text">Answers.</span>
          </h2>
        </AnimatedDiv>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <AnimatedDiv key={i} delay={i * 0.05}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className={`w-full text-left bg-white rounded-xl p-5 transition-all border ${
                  open === i ? "border-cyan/30 shadow-sm" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-gray-900">
                    {faq.q}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform flex-shrink-0 ${
                      open === i ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <AnimatePresence>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <p className="text-sm text-gray-500 mt-3 leading-relaxed">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </AnimatedDiv>
          ))}
        </div>
      </div>
    </section>
  );
}
