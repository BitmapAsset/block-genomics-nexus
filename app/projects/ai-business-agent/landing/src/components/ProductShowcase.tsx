"use client";
import { motion } from "framer-motion";
import AnimatedDiv from "./AnimatedDiv";

export default function ProductShowcase() {
  return (
    <section className="relative bg-[#0A0A0B] py-32 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <AnimatedDiv className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan mb-4 font-semibold">
            Product
          </p>
          <h2
            className="text-4xl md:text-6xl font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Your command{" "}
            <span className="gradient-text">center.</span>
          </h2>
        </AnimatedDiv>

        <AnimatedDiv delay={0.2}>
          <div className="relative">
            {/* Glow */}
            <div className="absolute -inset-10 bg-purple/5 rounded-3xl blur-[80px] pointer-events-none" />

            {/* Dashboard mockup */}
            <div className="relative glass-card rounded-2xl p-1 glow-purple">
              <div className="bg-dark-card rounded-xl p-6 md:p-10">
                {/* Top bar */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan to-purple opacity-60" />
                    <div>
                      <div className="h-3 bg-white/10 rounded w-24 mb-1" />
                      <div className="h-2 bg-white/5 rounded w-16" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 px-4 bg-cyan/10 rounded-lg flex items-center text-[10px] text-cyan font-medium">
                      Live
                    </div>
                    <div className="h-8 px-4 bg-white/5 rounded-lg flex items-center text-[10px] text-white/30">
                      Settings
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {[
                    { label: "Calls Today", value: "247", change: "+12%" },
                    { label: "Messages", value: "1,893", change: "+8%" },
                    { label: "Bookings", value: "64", change: "+23%" },
                    { label: "Satisfaction", value: "98.7%", change: "+0.3%" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="bg-white/[0.02] rounded-xl p-4 border border-white/5"
                    >
                      <div className="text-[10px] text-white/30 mb-1">
                        {s.label}
                      </div>
                      <div className="text-xl font-bold text-white">
                        {s.value}
                      </div>
                      <div className="text-[10px] text-emerald-400 mt-1">
                        {s.change}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chart */}
                <div className="bg-white/[0.02] rounded-xl p-6 border border-white/5">
                  <div className="flex items-end gap-1 h-32">
                    {Array.from({ length: 24 }, (_, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        whileInView={{ height: `${20 + Math.random() * 80}%` }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.03, duration: 0.6 }}
                        className="flex-1 bg-gradient-to-t from-cyan/30 to-purple/30 rounded-sm"
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-3">
                    <span className="text-[10px] text-white/20">12 AM</span>
                    <span className="text-[10px] text-white/20">12 PM</span>
                    <span className="text-[10px] text-white/20">11 PM</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating labels */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="hidden lg:block absolute -left-4 top-1/4 glass-card rounded-xl px-4 py-2"
            >
              <span className="text-[11px] text-cyan">Live Analytics</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 }}
              className="hidden lg:block absolute -right-4 top-1/3 glass-card rounded-xl px-4 py-2"
            >
              <span className="text-[11px] text-purple">AI Agents</span>
            </motion.div>
          </div>
        </AnimatedDiv>
      </div>
    </section>
  );
}
