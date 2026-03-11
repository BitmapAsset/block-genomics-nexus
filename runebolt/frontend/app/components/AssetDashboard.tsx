"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  Wallet,
  ArrowRight,
  Copy,
  Check,
  Send,
  Download,
  Zap,
  Clock,
  ChevronRight,
} from "lucide-react";
import { cn, formatSats, truncateAddress, type Asset, type Transaction } from "@/lib/utils";

// Asset Card Component
export function AssetCard({ asset, onSelect, selected }: { 
  asset: Asset; 
  onSelect: () => void; 
  selected: boolean;
}) {
  const typeColors = {
    rune: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    ordinal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    bitmap: "bg-green-500/20 text-green-400 border-green-500/30",
    brc20: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={cn(
        "relative w-full text-left p-4 rounded-2xl border-2 transition-all duration-300",
        "bg-gradient-to-br from-white/5 to-transparent",
        selected 
          ? "border-[#F7931A] shadow-[0_0_30px_rgba(247,147,26,0.3)]" 
          : "border-white/10 hover:border-white/20"
      )}
    >
      {selected && (
        <motion.div
          layoutId="selectedIndicator"
          className="absolute -top-2 -right-2 w-6 h-6 bg-[#F7931A] rounded-full flex items-center justify-center"
        >
          <Check className="w-4 h-4 text-black" />
        </motion.div>
      )}
      
      <div className="flex items-start gap-4">
        <div className="text-4xl">{asset.image}</div>
        <div className="flex-1 min-w-0">
          <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize", typeColors[asset.type])}>
            {asset.type}
          </span>
          <h4 className="font-semibold truncate mt-2">{asset.name}</h4>
          {asset.symbol && <p className="text-sm text-gray-500">{asset.symbol}</p>}
          <p className="text-xl font-bold mt-2 bitcoin-gradient">
            {asset.type === "bitmap" || asset.type === "ordinal"
              ? `${asset.amount} item${asset.amount > 1 ? 's' : ''}`
              : formatSats(asset.amount)}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// Transaction Row Component
export function TransactionRow({ tx }: { tx: Transaction }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(tx.txid || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColors = {
    completed: "bg-green-500/20 text-green-400 border-green-500/30",
    pending: "bg-[#F7931A]/20 text-[#F7931A] border-[#F7931A]/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
    >
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center",
        tx.type === "receive" ? "bg-green-500/20" : "bg-blue-500/20"
      )}>
        {tx.type === "receive" ? (
          <Download className="w-5 h-5 text-green-400" />
        ) : (
          <Send className="w-5 h-5 text-blue-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium capitalize">{tx.type}</span>
          <span className="text-gray-500">{tx.asset.name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{truncateAddress(tx.from)}</span>
          <ArrowRight className="w-3 h-3" />
          <span>{truncateAddress(tx.to)}</span>
        </div>
      </div>

      <div className="text-right">
        <p className={cn(
          "font-semibold",
          tx.type === "receive" ? "text-green-400" : "text-white"
        )}>
          {tx.type === "receive" ? "+" : "-"}
          {tx.asset.type === "bitmap" || tx.asset.type === "ordinal"
            ? `${tx.amount} item`
            : formatSats(tx.amount)}
        </p>
        <span className={cn("text-xs px-2 py-0.5 rounded-full border", statusColors[tx.status])}>
          {tx.status}
        </span>
      </div>

      <button
        onClick={handleCopy}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        title="Copy TXID"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
      </button>
    </motion.div>
  );
}

// Main Dashboard Component
export function AssetDashboard({ 
  connected, 
  address, 
  onConnect 
}: { 
  connected: boolean; 
  address: string;
  onConnect: () => void;
}) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [activeTab, setActiveTab] = useState<"assets" | "history">("assets");

  // Mock data
  const assets: Asset[] = [
    { id: "1", type: "rune", name: "DOG•GO•TO•THE•MOON", symbol: "$DOG", amount: 5000000, image: "🐕" },
    { id: "2", type: "bitmap", name: "Bitmap #720143", blockNumber: 720143, amount: 1, image: "🏙️" },
    { id: "3", type: "ordinal", name: "Inscription #119366628", inscriptionId: "119366628", amount: 1, image: "🎨" },
    { id: "4", type: "rune", name: "UNCOMMON•GOODS", symbol: "UNCOMMON", amount: 1000, image: "💎" },
  ];

  const transactions: Transaction[] = [
    {
      id: "1",
      type: "receive",
      asset: assets[0],
      amount: 1000000,
      from: "bc1p...xyz",
      to: "bc1p...abc",
      status: "completed",
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      txid: "abc123def456",
    },
    {
      id: "2",
      type: "send",
      asset: assets[1],
      amount: 1,
      from: "bc1p...abc",
      to: "bc1p...def",
      status: "pending",
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      txid: "def456ghi789",
    },
  ];

  if (!connected) {
    return (
      <div className="card text-center py-16">
        <div className="w-20 h-20 rounded-full bg-[#F7931A]/10 flex items-center justify-center mx-auto mb-6">
          <Wallet className="w-10 h-10 text-[#F7931A]" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          Connect your Bitcoin wallet to view your Runes, Ordinals, and Bitmap assets
        </p>
        <button onClick={onConnect} className="btn-primary">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wallet Info */}
      <div className="card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#F7931A]/10 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-[#F7931A]" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Connected Wallet</p>
            <p className="font-mono text-lg">{truncateAddress(address)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => navigator.clipboard.writeText(address)}
            className="btn-secondary"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-xl bg-white/5">
        <button
          onClick={() => setActiveTab("assets")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg font-medium transition-all",
            activeTab === "assets" 
              ? "bg-[#F7931A] text-black" 
              : "text-gray-400 hover:text-white"
          )}
        >
          My Assets
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg font-medium transition-all",
            activeTab === "history" 
              ? "bg-[#F7931A] text-black" 
              : "text-gray-400 hover:text-white"
          )}
        >
          History
        </button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "assets" ? (
          <motion.div
            key="assets"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={selectedAsset?.id === asset.id}
                onSelect={() => setSelectedAsset(asset)}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transfer Button */}
      {selectedAsset && activeTab === "assets" && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
        >
          <Zap className="w-5 h-5" />
          Transfer {selectedAsset.name}
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      )}
    </div>
  );
}
