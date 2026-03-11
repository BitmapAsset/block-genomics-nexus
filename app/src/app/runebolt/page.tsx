"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Wallet,
  ArrowRightLeft,
  History,
  Shield,
  Clock,
  Bitcoin,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { cn, formatSats, truncateAddress, wallets, type Asset, type Transaction } from "@/lib/runebolt-utils";
import { AssetDashboard } from "./components/AssetDashboard";

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };
const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };

function Navbar({ connected, address, onConnect }: { connected: boolean; address?: string; onConnect: () => void }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F7931A] to-[#FFD700] flex items-center justify-center">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <span className="text-xl font-bold bitcoin-gradient">RuneBolt</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">How it Works</a>
            <a href="#transfer" className="text-sm text-gray-400 hover:text-white transition-colors">Transfer</a>
          </div>
          <button onClick={onConnect} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all", connected ? "bg-green-500/20 text-green-400 border border-green-500/30" : "btn-primary")}>
            <Wallet className="w-4 h-4" />
            {connected ? truncateAddress(address || "") : "Connect Wallet"}
          </button>
        </div>
      </div>
    </nav>
  );
}

export default function RuneBoltPage() {
  const [connected, setConnected] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [address, setAddress] = useState("bc1p6gnhrkmxfggytctzyq6qsenkzjlvkdapmap73guy5g8kuvtkwjzq7xpr4d");

  const handleConnect = () => setWalletModalOpen(true);
  const handleWalletSelect = (walletId: string) => { setConnected(true); setWalletModalOpen(false); };

  return (
    <main className="min-h-screen bg-black">
      <Navbar connected={connected} address={address} onConnect={handleConnect} />
      <section className="relative min-h-screen flex items-center justify-center pt-16">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#F7931A]/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#FFD700]/10 rounded-full blur-[120px]" />
        </div>
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
            <button onClick={handleConnect} className="btn-primary flex items-center justify-center gap-2 text-lg px-8 py-4">
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
      </section>
      <section id="transfer" className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Your <span className="bitcoin-gradient">Assets</span></h2>
            <p className="text-gray-400 max-w-2xl mx-auto">Manage and transfer your Bitcoin assets instantly</p>
          </div>
          <AssetDashboard connected={connected} address={address} onConnect={handleConnect} />
        </div>
      </section>
      <AnimatePresence>
        {walletModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setWalletModalOpen(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Connect Wallet</h2>
                <button onClick={() => setWalletModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <div className="space-y-3">
                {wallets.map((wallet) => (
                  <button key={wallet.id} onClick={() => handleWalletSelect(wallet.id)} className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#F7931A]/30 transition-all">
                    <span className="text-2xl">{wallet.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="font-medium">{wallet.name}</div>
                      <div className="text-sm text-gray-500">{wallet.description}</div>
                    </div>
                    {wallet.installed ? <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">Installed</span> : <ExternalLink className="w-4 h-4 text-gray-500" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
