"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedDiv from "./AnimatedDiv";
import PaymentModal from "./PaymentModal";
import { Check, X, Zap, Shield, ChevronDown, ChevronUp } from "lucide-react";

/* ─── Plan data ─── */
const plans = [
  {
    key: "free",
    name: "Free",
    emoji: "🆓",
    monthly: 0,
    yearly: 0,
    tagline: "Get started instantly",
    cta: "Get Started",
    href: "/download",
    outlined: true,
    badge: null,
    priceIdMonthly: null,
    priceIdYearly: null,
  },
  {
    key: "starter",
    name: "Starter",
    emoji: "⚡",
    monthly: 99,
    yearly: 79,
    tagline: "For small businesses",
    cta: "Start Trial",
    href: null,
    outlined: false,
    badge: null,
    priceIdMonthly: "price_1T4NEO2N7Xi6EQBj0YRgWMd1",
    priceIdYearly: "price_1T4NKP2N7Xi6EQBjkWVEHwi1",
  },
  {
    key: "professional",
    name: "Professional",
    emoji: "💼",
    monthly: 299,
    yearly: 249,
    tagline: "For growing businesses",
    cta: "Start Trial",
    href: null,
    outlined: false,
    badge: "Most Popular",
    popular: true,
    priceIdMonthly: "price_1T4NFI2N7Xi6EQBjcVlbTLJX",
    priceIdYearly: "price_1T4NLd2N7Xi6EQBj8Z6QDumL",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    emoji: "🏢",
    monthly: 499,
    yearly: 399,
    tagline: "For large operations",
    cta: "Start Trial",
    href: null,
    outlined: false,
    badge: "Best Value for Teams",
    priceIdMonthly: "price_1T4NJh2N7Xi6EQBjDc5YF4xH",
    priceIdYearly: "price_1T4NJh2N7Xi6EQBjiUhkR5Zk",
  },
];

/* Card-level feature bullets */
const cardFeatures: Record<string, string[]> = {
  free: [
    "Naxora Brain (built-in AI)",
    "50 conversations/mo",
    "1 AI Sub-Agent",
    "2 channels",
    "Basic analytics",
    "Community support",
  ],
  starter: [
    "Everything in Free, plus:",
    "500 conversations/mo",
    "3 AI Sub-Agents",
    "3 team members",
    "4 channels",
    "100 MB knowledge base",
    "Email support (24h)",
  ],
  professional: [
    "Everything in Starter, plus:",
    "2,000 conversations/mo",
    "10 AI Sub-Agents",
    "10 team members",
    "All 6 channels",
    "1 GB knowledge base",
    "Inbound + Outbound calls",
    "Read-only API access",
    "Email support (12h)",
  ],
  enterprise: [
    "Everything in Professional, plus:",
    "Unlimited conversations",
    "Unlimited AI Sub-Agents",
    "Unlimited team members",
    "Multi-location branches",
    "SSO (Google/Microsoft)",
    "Full API + Webhooks",
    "Priority support (4h)",
  ],
};

/* ─── Full comparison table ─── */
type CellValue = string | boolean;
interface ComparisonRow {
  feature: string;
  free: CellValue;
  starter: CellValue;
  professional: CellValue;
  enterprise: CellValue;
}

const comparisonData: ComparisonRow[] = [
  { feature: "Naxora Brain (built-in AI)", free: true, starter: true, professional: true, enterprise: true },
  { feature: "Conversations/mo", free: "50", starter: "500", professional: "2,000", enterprise: "Unlimited" },
  { feature: "AI Sub-Agents", free: "1", starter: "3", professional: "10", enterprise: "Unlimited" },
  { feature: "Team Members", free: "1 (solo)", starter: "3", professional: "10", enterprise: "Unlimited" },
  { feature: "Channels", free: "2", starter: "4", professional: "All 6", enterprise: "All 6" },
  { feature: "Agent Customization", free: "Basic", starter: "Full", professional: "Full", enterprise: "Full" },
  { feature: "RBAC (Role Access)", free: false, starter: "Viewer only", professional: "Admin + Editor + Viewer", enterprise: "Full + Custom Roles" },
  { feature: "Audit Log", free: false, starter: false, professional: "30 days", enterprise: "Unlimited + Export" },
  { feature: "Knowledge Base", free: "10 MB", starter: "100 MB", professional: "1 GB", enterprise: "5 GB" },
  { feature: "Analytics", free: "Basic", starter: "Standard", professional: "Advanced", enterprise: "Advanced + Export" },
  { feature: "Phone / Voice Calls", free: false, starter: "Inbound only", professional: "Inbound + Outbound", enterprise: "Unlimited" },
  { feature: "API Access", free: false, starter: false, professional: "Read-only", enterprise: "Full Read/Write" },
  { feature: "Webhooks (Zapier)", free: false, starter: false, professional: "3 webhooks", enterprise: "Unlimited" },
  { feature: "Multi-Location Branches", free: false, starter: false, professional: false, enterprise: "✅ Unlimited" },
  { feature: "SSO (Google/Microsoft)", free: false, starter: false, professional: false, enterprise: true },
  { feature: "Advanced AI Training", free: false, starter: false, professional: "Basic", enterprise: "Full (SOPs, docs)" },
  { feature: "Support", free: "Community", starter: "Email (24h)", professional: "Email (12h)", enterprise: "Priority (4h)" },
  { feature: "Onboarding", free: "Self-serve", starter: "Self-serve", professional: "Guided", enterprise: "Priority guided" },
];

/* ─── FAQ ─── */
const faqs = [
  { q: "Can I switch plans anytime?", a: "Yes, upgrade or downgrade instantly. Changes are prorated." },
  { q: "Is there a contract?", a: "No, cancel anytime. No long-term commitment required." },
  { q: "What happens when I hit my limit?", a: "You'll get a notification and can upgrade to continue seamlessly." },
  { q: "Do you offer refunds?", a: "Yes — 14-day money-back guarantee, no questions asked." },
  { q: "Can I pay with Bitcoin?", a: "Yes! 10% discount for Bitcoin payments (Lightning or on-chain). ⚡" },
];

/* ─── Cell renderer ─── */
function CellDisplay({ value }: { value: CellValue }) {
  if (value === true) return <Check size={18} className="text-emerald-500 mx-auto" />;
  if (value === false) return <span className="text-gray-300">—</span>;
  return <span className="text-sm text-gray-600">{value}</span>;
}

/* ─── Component ─── */
export default function Pricing() {
  const [yearly, setYearly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(plans[2]);
  const [tableOpen, setTableOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleCta = async (plan: (typeof plans)[0]) => {
    if (plan.href) {
      window.location.href = plan.href;
      return;
    }
    // Stripe checkout
    const priceId = yearly ? plan.priceIdYearly : plan.priceIdMonthly;
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, plan: plan.key }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setSelectedPlan(plan);
      setModalOpen(true);
    }
  };

  return (
    <>
      <section id="pricing" className="relative bg-white py-32 overflow-hidden">
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          {/* Header */}
          <AnimatedDiv className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-cyan/5 border border-cyan/10 text-cyan text-sm font-medium px-5 py-2 rounded-full">
              <Zap size={14} />
              Start free, upgrade when you&apos;re ready
            </div>
          </AnimatedDiv>

          <AnimatedDiv className="text-center mb-16">
            <h2
              className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Simple, transparent{" "}
              <span className="gradient-text">pricing.</span>
            </h2>
            <p className="mt-4 text-gray-500 text-lg">
              Scale as you grow. Cancel anytime.
            </p>

            {/* Toggle */}
            <div className="mt-8 flex items-center justify-center gap-4">
              <span className={`text-sm font-medium transition-colors ${!yearly ? "text-gray-900" : "text-gray-400"}`}>
                Monthly
              </span>
              <button
                onClick={() => setYearly(!yearly)}
                className={`relative w-14 h-7 rounded-full transition-colors ${yearly ? "bg-gradient-to-r from-cyan to-purple" : "bg-gray-200"}`}
              >
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${yearly ? "translate-x-8" : "translate-x-1"}`} />
              </button>
              <span className={`text-sm font-medium transition-colors ${yearly ? "text-gray-900" : "text-gray-400"}`}>
                Yearly
              </span>
              {yearly && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="gradient-btn text-xs font-bold px-3 py-1 rounded-full"
                >
                  Save 20%
                </motion.span>
              )}
            </div>
          </AnimatedDiv>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {plans.map((plan, i) => {
              const price = yearly ? plan.yearly : plan.monthly;
              const isPro = plan.popular;
              const isEnterprise = plan.key === "enterprise";
              const isOutlined = plan.outlined;

              return (
                <AnimatedDiv key={plan.key} delay={i * 0.08}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`relative rounded-2xl p-8 h-full flex flex-col ${
                      isPro
                        ? "bg-[#0A0A0B] text-white ring-2 ring-cyan/30 shadow-2xl shadow-cyan/10 lg:scale-105 lg:-my-4 z-10"
                        : isOutlined
                          ? "bg-white border border-gray-200"
                          : "bg-white border border-gray-200 shadow-sm"
                    }`}
                  >
                    {/* Badges */}
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 gradient-btn text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
                        Most Popular
                      </div>
                    )}
                    {isEnterprise && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-purple text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
                        Best Value for Teams
                      </div>
                    )}

                    <p className={`text-sm font-medium ${isPro ? "text-white/40" : "text-gray-400"}`}>
                      {plan.emoji} {plan.tagline}
                    </p>
                    <h3 className={`text-xl font-bold mt-1 ${isPro ? "text-white" : "text-gray-900"}`}>
                      {plan.name}
                    </h3>

                    {/* Price */}
                    <div className="mt-5 mb-6">
                      {price === 0 ? (
                        <div>
                          <span className={`text-5xl leading-none font-bold ${isPro ? "text-white" : "text-gray-900"}`}>$0</span>
                          <span className={`text-sm ml-1 ${isPro ? "text-white/30" : "text-gray-400"}`}>/mo forever</span>
                        </div>
                      ) : (
                        <div>
                          <span className={`text-5xl leading-none font-bold ${isPro ? "text-white" : "text-gray-900"}`}>${price}</span>
                          <span className={`text-sm ml-1 ${isPro ? "text-white/30" : "text-gray-400"}`}>/mo</span>
                          {yearly && plan.monthly > 0 && (
                            <p className={`text-xs mt-1 line-through ${isPro ? "text-white/20" : "text-gray-300"}`}>
                              ${plan.monthly}/mo
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 flex-1">
                      {cardFeatures[plan.key].map((f) => (
                        <li key={f} className="flex items-start gap-3">
                          <Check size={16} className="mt-0.5 flex-shrink-0 text-cyan" />
                          <span className={`text-sm ${isPro ? "text-white/60" : "text-gray-500"}`}>{f}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => handleCta(plan)}
                      className={`mt-8 w-full text-center font-semibold py-3.5 rounded-full transition-all ${
                        isPro
                          ? "gradient-btn"
                          : isOutlined
                            ? "border border-cyan/30 text-cyan hover:bg-cyan/5"
                            : "gradient-btn"
                      }`}
                    >
                      {plan.cta}
                    </button>

                    {plan.monthly > 0 && (
                      <button
                        onClick={() => { setSelectedPlan(plan); setModalOpen(true); }}
                        className={`mt-3 text-center text-xs transition-colors ${isPro ? "text-white/20 hover:text-[#f7931a]" : "text-gray-300 hover:text-[#f7931a]"}`}
                      >
                        Pay with Bitcoin ⚡ <span className="text-cyan">Save 10%</span>
                      </button>
                    )}
                  </motion.div>
                </AnimatedDiv>
              );
            })}
          </div>

          {/* Trust bar */}
          <AnimatedDiv delay={0.4} className="mt-16">
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 text-gray-400 text-sm">
              <div className="flex items-center gap-2"><Shield size={16} className="text-cyan" />14-day money-back guarantee</div>
              <div className="flex items-center gap-2"><Check size={16} className="text-cyan" />Cancel anytime</div>
              <div className="flex items-center gap-2"><Check size={16} className="text-cyan" />No hidden fees</div>
              <div className="flex items-center gap-2">🔒 SSL Encrypted</div>
            </div>
          </AnimatedDiv>

          {/* ─── Full Comparison Table (Accordion) ─── */}
          <AnimatedDiv delay={0.5} className="mt-20 max-w-6xl mx-auto">
            <button
              onClick={() => setTableOpen(!tableOpen)}
              className="w-full flex items-center justify-center gap-2 text-gray-700 font-semibold text-lg hover:text-cyan transition-colors"
            >
              {tableOpen ? "Hide" : "View"} full feature comparison
              {tableOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            <AnimatePresence>
              {tableOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-8 overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="w-full text-left min-w-[700px]">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="py-4 px-6 text-sm font-semibold text-gray-700 w-1/3">Feature</th>
                          {plans.map((p) => (
                            <th key={p.key} className={`py-4 px-4 text-sm font-semibold text-center ${p.popular ? "text-cyan" : "text-gray-700"}`}>
                              {p.emoji} {p.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonData.map((row, idx) => (
                          <tr key={row.feature} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                            <td className="py-3 px-6 text-sm text-gray-700 font-medium">{row.feature}</td>
                            {(["free", "starter", "professional", "enterprise"] as const).map((k) => (
                              <td key={k} className="py-3 px-4 text-center">
                                <CellDisplay value={row[k]} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </AnimatedDiv>

          {/* ─── FAQ ─── */}
          <AnimatedDiv delay={0.6} className="mt-24 max-w-3xl mx-auto">
            <h3 className="text-3xl font-bold text-center text-gray-900 mb-10" style={{ fontFamily: "var(--font-heading)" }}>
              Frequently asked <span className="gradient-text">questions</span>
            </h3>
            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{faq.q}</span>
                    {openFaq === idx ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </button>
                  <AnimatePresence>
                    {openFaq === idx && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="px-6 pb-4 text-gray-500 text-sm">{faq.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </AnimatedDiv>
        </div>
      </section>

      <PaymentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        plan={selectedPlan}
        yearly={yearly}
      />
    </>
  );
}
