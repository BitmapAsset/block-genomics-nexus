"use client";

import { motion } from "framer-motion";
import { Zap, Wallet, Shield, Clock, Bitcoin, ChevronRight } from "lucide-react";

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };
const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };

export default function RuneBoltMotion({ onConnect }: { onConnect: () => void }) {
  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="relative z-10 max-w-5xl mx-auto px-4 text-center">
      <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F7931A]/10 border border-[#F7931A]/20 mb-8">
        <Zap className="w-4 h-4 text-[#F7931A]" />
        <span className="text-sm text-[#F7931A] font-medium">Lightning Deed Protocol v0.1</span>
      </motion.div>
      <motion.h1 variants={fadeIn} className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
        <span className="bitcoin-gradient">Instant</span> Bitcoin<br />Asset Transfers
      </motion.h1>
      <motion.p variants={fadeIn} className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
        Transfer Runes, Ordinals, and Bitmap instantly over Lightning Network. No custodial risk. Pure Bitcoin script magic.
      </motion.p>
      <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
        <button onClick={onConnect} className="btn-primary flex items-center justify-center gap-2 text-lg px-8 py-4">
          <Wallet className="w-5 h-5" /> Connect Wallet <ChevronRight className="w-5 h-5" />
        </button>
      </motion.div>
      <motion.div variants={fadeIn} className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
        {[{ icon: Clock, label: "Transfer Time", value: "< 1 second" }, { icon: Shield, label: "Security", value: "Non-custodial" }, { icon: Bitcoin, label: "Assets", value: "Runes, Ordinals, Bitmap" }].map((stat) => (
          <div key={stat.label} className="card text-center">
            <stat.icon className="w-6 h-6 text-[#F7931A] mx-auto mb-2" />
            <div className="text-2xl font-bold mb-1">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
