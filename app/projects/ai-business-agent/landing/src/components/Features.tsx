"use client";
import { motion } from "framer-motion";
import AnimatedDiv from "./AnimatedDiv";
import {
  Phone,
  MessageCircle,
  Bot,
  Brain,
  SlidersHorizontal,
  BarChart3,
} from "lucide-react";

const features = [
  {
    icon: Phone,
    title: "Never Miss a Call",
    desc: "AI answers every call with natural conversation — understands context, handles objections, books appointments.",
  },
  {
    icon: MessageCircle,
    title: "Every Channel, One Mind",
    desc: "WhatsApp, SMS, Email, Phone, Web Widget — all unified under one intelligent brain.",
  },
  {
    icon: Bot,
    title: "Specialized Agents",
    desc: "Receptionist, Support, Sales, Booking — each role-trained with domain expertise.",
  },
  {
    icon: Brain,
    title: "Learns Everything",
    desc: "Upload docs, FAQs, menus, procedures — instant knowledge absorption, zero training time.",
  },
  {
    icon: SlidersHorizontal,
    title: "You're In Control",
    desc: "Set autonomy levels, approval queues, escalation rules. Your business, your way.",
  },
  {
    icon: BarChart3,
    title: "See Everything",
    desc: "Real-time analytics, peak hours, conversation quality, agent performance — all in one dashboard.",
  },
];

export default function Features() {
  return (
    <section
      id="features"
      className="relative bg-[#f8f9fb] py-32 overflow-hidden"
    >
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <AnimatedDiv className="text-center mb-20">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan mb-4 font-semibold">
            Features
          </p>
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Everything your business{" "}
            <span className="gradient-text">needs.</span>
          </h2>
        </AnimatedDiv>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <AnimatedDiv key={f.title} delay={i * 0.08}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="light-card rounded-2xl p-8 h-full group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan/10 to-purple/10 flex items-center justify-center mb-5 group-hover:from-cyan/20 group-hover:to-purple/20 transition-all">
                    <Icon size={22} className="text-cyan" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    {f.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {f.desc}
                  </p>
                </motion.div>
              </AnimatedDiv>
            );
          })}
        </div>
      </div>
    </section>
  );
}
