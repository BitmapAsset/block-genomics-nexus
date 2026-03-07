"use client";
import AnimatedDiv from "./AnimatedDiv";
import { Shield, Check } from "lucide-react";

const points = [
  "End-to-end encryption on all channels",
  "SOC 2 Type II compliant infrastructure",
  "GDPR & CCPA data handling",
  "99.99% uptime SLA",
  "Role-based access controls",
  "Audit logs for every interaction",
];

export default function Security() {
  return (
    <section className="relative bg-[#f8f9fb] py-32 overflow-hidden">
      <div className="max-w-4xl mx-auto px-6">
        <AnimatedDiv className="bg-white rounded-3xl p-10 md:p-16 text-center border border-gray-200 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan/10 to-purple/10 flex items-center justify-center mx-auto mb-6">
            <Shield size={28} className="text-cyan" />
          </div>
          <h2
            className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Enterprise-grade{" "}
            <span className="gradient-text">by default.</span>
          </h2>
          <p className="text-gray-500 text-lg mb-10 max-w-lg mx-auto">
            Your data security is non-negotiable. Every Naxora plan includes
            enterprise-level protection.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto">
            {points.map((p) => (
              <div key={p} className="flex items-center gap-3">
                <Check size={16} className="text-cyan flex-shrink-0" />
                <span className="text-sm text-gray-600">{p}</span>
              </div>
            ))}
          </div>
        </AnimatedDiv>
      </div>
    </section>
  );
}
