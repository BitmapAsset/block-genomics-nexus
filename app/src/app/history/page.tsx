"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useGlobalWallet } from "@/context/GlobalWalletContext";

type FilterType = "all" | "verification" | "delegation" | "transfer";

interface Activity {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Delegation {
  id: string;
  blockHeight: number;
  tier: number;
  priceSats: number;
  startDate: string;
  endDate: string;
  active: boolean;
  createdAt: string;
  ownerAddress: string;
  delegateeAddress: string;
}

interface Transfer {
  id: string;
  blockHeight: number;
  previousOwner: string;
  newOwner: string;
  detectedAt: string;
}

interface HistoryData {
  activities: Activity[];
  delegations: Delegation[];
  transfers: Transfer[];
  total: number;
  page: number;
  totalPages: number;
}

/* ─── Unified timeline item ─── */
interface TimelineItem {
  id: string;
  type: "activity" | "delegation" | "transfer";
  action: string;
  date: string;
  blockHeight?: number;
  metadata?: Record<string, unknown> | null;
  raw: Activity | Delegation | Transfer;
}

const typeLabels: Record<string, { label: string; color: string; icon: string }> = {
  verify_start: { label: "Verification", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: "shield" },
  wallet_connect: { label: "Wallet Connect", color: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/20", icon: "link" },
  wallet_disconnect: { label: "Wallet Disconnect", color: "text-text-muted bg-bg-tertiary border-border", icon: "unlink" },
  delegation_purchase: { label: "Delegation Purchase", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: "handshake" },
  delegation_list: { label: "Delegation Listed", color: "text-purple-400 bg-purple-500/10 border-purple-500/20", icon: "tag" },
  delegation_view: { label: "Delegation View", color: "text-text-secondary bg-bg-tertiary border-border", icon: "eye" },
  chat_message: { label: "Chat Message", color: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/20", icon: "message" },
  block_view: { label: "Block View", color: "text-text-secondary bg-bg-tertiary border-border", icon: "cube" },
  nexus_view: { label: "Nexus View", color: "text-text-secondary bg-bg-tertiary border-border", icon: "globe" },
  delegation_active: { label: "Delegation Active", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: "check-circle" },
  delegation_expired: { label: "Delegation Expired", color: "text-text-muted bg-bg-tertiary border-border", icon: "clock" },
  transfer_received: { label: "Block Received", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: "download" },
  transfer_sent: { label: "Block Sent", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: "upload" },
};

function getTypeInfo(action: string) {
  return typeLabels[action] || { label: action.replace(/_/g, " "), color: "text-text-secondary bg-bg-tertiary border-border", icon: "activity" };
}

/* ─── Icon component using simple SVG paths ─── */
function TimelineIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
    unlink: "M18.84 12.25l1.72-1.71a5 5 0 00-7.07-7.07l-3 3M5.16 11.75l-1.72 1.71a5 5 0 007.07 7.07l3-3M8 2v3M2 8h3M16 22v-3M22 16h-3",
    handshake: "M20.42 4.58a5.4 5.4 0 00-7.65 0l-.77.78-.77-.78a5.4 5.4 0 00-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z",
    tag: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z",
    message: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    cube: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
    globe: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
    "check-circle": "M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3",
    clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6v6l4 2",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3",
    upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  };

  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {(icons[icon] || icons.activity).split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncateAddr(addr: string) {
  if (!addr || addr.length < 14) return addr;
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

/* ─── Merge all data into unified timeline ─── */
function buildTimeline(data: HistoryData, walletAddress: string): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const a of data.activities) {
    items.push({
      id: a.id,
      type: "activity",
      action: a.action,
      date: a.createdAt,
      metadata: a.metadata,
      blockHeight: (a.metadata?.blockHeight as number) || undefined,
      raw: a,
    });
  }

  for (const d of data.delegations) {
    items.push({
      id: d.id,
      type: "delegation",
      action: d.active ? "delegation_active" : "delegation_expired",
      date: d.createdAt,
      blockHeight: d.blockHeight,
      raw: d,
    });
  }

  for (const t of data.transfers) {
    items.push({
      id: t.id,
      type: "transfer",
      action: t.newOwner === walletAddress ? "transfer_received" : "transfer_sent",
      date: t.detectedAt,
      blockHeight: t.blockHeight,
      raw: t,
    });
  }

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/* ─── CSV Export ─── */
function exportToCSV(items: TimelineItem[], walletAddress: string) {
  const rows = [["Date", "Type", "Action", "Block", "Details"]];

  for (const item of items) {
    const info = getTypeInfo(item.action);
    let details = "";

    if (item.type === "delegation") {
      const d = item.raw as Delegation;
      details = `${d.priceSats} sats, Tier ${d.tier}, ${d.ownerAddress === walletAddress ? "delegated to " + truncateAddr(d.delegateeAddress) : "from " + truncateAddr(d.ownerAddress)}`;
    } else if (item.type === "transfer") {
      const t = item.raw as Transfer;
      details = `${truncateAddr(t.previousOwner)} -> ${truncateAddr(t.newOwner)}`;
    } else if (item.metadata) {
      details = JSON.stringify(item.metadata).slice(0, 120);
    }

    rows.push([
      formatDate(item.date),
      info.label,
      item.action,
      item.blockHeight ? `#${item.blockHeight}` : "",
      details,
    ]);
  }

  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blockgenomics-history-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Timeline Card ─── */
function TimelineCard({
  item,
  walletAddress,
  index,
}: {
  item: TimelineItem;
  walletAddress: string;
  index: number;
}) {
  const info = getTypeInfo(item.action);

  const renderDetails = () => {
    if (item.type === "delegation") {
      const d = item.raw as Delegation;
      return (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-orange-400">{d.priceSats.toLocaleString()} sats</span>
            <span className="text-text-muted">Tier {d.tier}</span>
            <span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${d.active ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-text-muted bg-bg-tertiary border-border"}`}>
              {d.active ? "Active" : "Expired"}
            </span>
          </div>
          <p className="text-xs text-text-muted">
            {d.ownerAddress === walletAddress ? "Delegated to" : "Received from"}{" "}
            <span className="font-mono text-text-secondary">{truncateAddr(d.ownerAddress === walletAddress ? d.delegateeAddress : d.ownerAddress)}</span>
          </p>
        </div>
      );
    }

    if (item.type === "transfer") {
      const t = item.raw as Transfer;
      return (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="font-mono text-text-secondary">{truncateAddr(t.previousOwner)}</span>
            <svg className="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            <span className="font-mono text-text-secondary">{truncateAddr(t.newOwner)}</span>
          </div>
        </div>
      );
    }

    if (item.metadata && Object.keys(item.metadata).length > 0) {
      return (
        <p className="mt-1 text-xs text-text-muted font-mono truncate max-w-md">
          {JSON.stringify(item.metadata).slice(0, 80)}
        </p>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="relative pl-8 pb-6 group"
    >
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-gradient-to-b from-border-hover to-transparent" />

      {/* Timeline dot */}
      <div className={`absolute left-0 top-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
        item.type === "delegation" ? "border-orange-500/50 bg-orange-500/10 text-orange-400" :
        item.type === "transfer" ? "border-green-500/50 bg-green-500/10 text-green-400" :
        "border-accent-cyan/30 bg-accent-cyan/5 text-accent-cyan"
      } group-hover:scale-110`}>
        <TimelineIcon icon={info.icon} />
      </div>

      {/* Card */}
      <div className="glass-panel p-4 hover:border-border-hover transition-all duration-300 group-hover:translate-x-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${info.color}`}>
                {info.label}
              </span>
              {item.blockHeight && (
                <Link
                  href={`/block/${item.blockHeight}`}
                  className="text-xs font-mono text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                >
                  Block #{item.blockHeight.toLocaleString()}
                </Link>
              )}
            </div>
            {renderDetails()}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted shrink-0">
            <span title={formatDate(item.date)}>{formatDateShort(item.date)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Stats Bar ─── */
function StatsBar({ data }: { data: HistoryData }) {
  const stats = [
    { label: "Events", value: data.activities.length, color: "text-accent-cyan" },
    { label: "Delegations", value: data.delegations.length, color: "text-orange-400" },
    { label: "Transfers", value: data.transfers.length, color: "text-green-400" },
    { label: "Total", value: data.total, color: "text-text-primary" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {stats.map((s) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-4 text-center"
        >
          <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
          <div className="text-xs text-text-muted mt-1 uppercase tracking-wider">{s.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Date Filter ─── */
function DateFilter({
  dateRange,
  setDateRange,
  blockFilter,
  setBlockFilter,
}: {
  dateRange: { from: string; to: string };
  setDateRange: (r: { from: string; to: string }) => void;
  blockFilter: string;
  setBlockFilter: (b: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-text-muted">From</label>
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-bg-secondary/60 text-text-primary focus:outline-none focus:border-accent-cyan/50"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-text-muted">To</label>
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-bg-secondary/60 text-text-primary focus:outline-none focus:border-accent-cyan/50"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-text-muted">Block</label>
        <input
          type="text"
          value={blockFilter}
          onChange={(e) => setBlockFilter(e.target.value.replace(/\D/g, ""))}
          placeholder="#"
          className="w-24 text-xs px-2 py-1.5 rounded-lg border border-border bg-bg-secondary/60 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50 font-mono"
        />
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function HistoryPage() {
  const { isConnected, walletAddress } = useGlobalWallet();
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterType>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [blockFilter, setBlockFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async (p: number, type: FilterType) => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/v1/history?wallet=${walletAddress}&page=${p}&type=${type}`);
      if (!resp.ok) throw new Error("Failed to fetch");
      const json = await resp.json();
      setData(json.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchHistory(page, filter);
    } else {
      setLoading(false);
    }
  }, [isConnected, walletAddress, page, filter, fetchHistory]);

  const timeline = data ? buildTimeline(data, walletAddress || "") : [];

  // Apply client-side date/block filters
  const filteredTimeline = timeline.filter((item) => {
    if (dateRange.from) {
      const itemDate = new Date(item.date).toISOString().split("T")[0];
      if (itemDate < dateRange.from) return false;
    }
    if (dateRange.to) {
      const itemDate = new Date(item.date).toISOString().split("T")[0];
      if (itemDate > dateRange.to) return false;
    }
    if (blockFilter && item.blockHeight) {
      if (!String(item.blockHeight).includes(blockFilter)) return false;
    }
    if (blockFilter && !item.blockHeight) return false;
    return true;
  });

  const handleExport = () => {
    if (!filteredTimeline.length) return;
    setExporting(true);
    setTimeout(() => {
      exportToCSV(filteredTimeline, walletAddress || "");
      setExporting(false);
    }, 100);
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 text-center max-w-md"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-text-secondary mb-6">
            Connect your Bitcoin wallet to view your complete transaction history.
          </p>
          <button
            onClick={() => window.dispatchEvent(new Event("open-wallet-modal"))}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/25 transition-all cursor-pointer"
          >
            Connect Wallet
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-bold mb-2">
              <span className="text-gradient-cyan-purple">Transaction History</span>
            </h1>
            <p className="text-text-secondary text-sm">
              Your complete activity timeline on Block Genomics.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Filters + Actions */}
      <div className="sticky top-16 z-40 bg-bg-primary/90 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Type Filters */}
            <div className="flex gap-2">
              {(["all", "verification", "delegation", "transfer"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setFilter(t); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                    filter === t
                      ? "bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan"
                      : "border-border text-text-muted hover:text-text-secondary hover:border-border-hover"
                  }`}
                >
                  {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={!filteredTimeline.length || exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text-secondary hover:border-border-hover hover:text-text-primary transition-all disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>

          {/* Date/Block Filters */}
          <div className="mt-3">
            <DateFilter
              dateRange={dateRange}
              setDateRange={setDateRange}
              blockFilter={blockFilter}
              setBlockFilter={setBlockFilter}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
            <p className="text-text-muted text-sm">Loading your history...</p>
          </div>
        ) : !data || filteredTimeline.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-tertiary/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {blockFilter || dateRange.from || dateRange.to ? "No matching results" : "No history yet"}
            </h3>
            <p className="text-sm text-text-muted mb-6">
              {blockFilter || dateRange.from || dateRange.to
                ? "Try adjusting your filters to see more results."
                : "Your transactions will appear here once you start using the platform."}
            </p>
            {!(blockFilter || dateRange.from || dateRange.to) && (
              <Link
                href="/nexus"
                className="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/25 transition-all"
              >
                Explore the Nexus
              </Link>
            )}
          </motion.div>
        ) : (
          <>
            {/* Stats */}
            <StatsBar data={data} />

            {/* Timeline */}
            <div ref={timelineRef}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${filter}-${page}-${dateRange.from}-${dateRange.to}-${blockFilter}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {filteredTimeline.map((item, i) => (
                    <TimelineCard
                      key={item.id}
                      item={item}
                      walletAddress={walletAddress || ""}
                      index={i}
                    />
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-xs rounded-lg border border-border text-text-secondary hover:border-border-hover transition-all disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  Previous
                </button>
                <span className="text-xs text-text-muted">
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages}
                  className="px-4 py-2 text-xs rounded-lg border border-border text-text-secondary hover:border-border-hover transition-all disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
