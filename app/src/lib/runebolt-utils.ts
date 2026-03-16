import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind CSS classes with conflict resolution */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format satoshi amount to human-readable string (BTC for large, sats otherwise) */
export function formatSats(sats: number): string {
  if (sats >= 100000000) return `${(sats / 100000000).toFixed(8)} BTC`;
  if (sats >= 1000) return `${sats.toLocaleString()} sats`;
  return `${sats} sats`;
}

/** Truncate a Bitcoin address for display (e.g., "bc1q8x...4f2n") */
export function truncateAddress(address: string, start = 6, end = 4): string {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export const wallets = [
  { id: "unisat", name: "Unisat", icon: "🔶", description: "Most popular Bitcoin wallet", installed: typeof window !== "undefined" && !!window.unisat },
  { id: "xverse", name: "Xverse", icon: "🌐", description: "Mobile & desktop Bitcoin wallet", installed: typeof window !== "undefined" && !!window.BitcoinProvider },
  { id: "leather", name: "Leather", icon: "🦊", description: "Stacks & Bitcoin wallet", installed: typeof window !== "undefined" && !!window.LeatherProvider },
  { id: "okx", name: "OKX Wallet", icon: "🔵", description: "Multi-chain exchange wallet", installed: typeof window !== "undefined" && !!window.okxwallet },
];

export type AssetType = "rune" | "ordinal" | "bitmap" | "brc20";

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  symbol?: string;
  amount: number;
  image?: string;
  inscriptionId?: string;
  blockNumber?: number;
}

export interface Transaction {
  id: string;
  type: "send" | "receive";
  asset: Asset;
  amount: number;
  from: string;
  to: string;
  status: "pending" | "completed" | "failed";
  timestamp: Date;
  txid?: string;
}
