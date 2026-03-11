import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSats(sats: number): string {
  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(8)} BTC`;
  } else if (sats >= 1000) {
    return `${sats.toLocaleString()} sats`;
  }
  return `${sats} sats`;
}

export function truncateAddress(address: string, start = 6, end = 4): string {
  if (!address) return "";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const wallets = [
  {
    id: "unisat",
    name: "Unisat",
    icon: "🔶",
    description: "Most popular Bitcoin wallet",
    installed: typeof window !== "undefined" && !!(window as any).unisat,
  },
  {
    id: "xverse",
    name: "Xverse",
    icon: "🌐",
    description: "Mobile & desktop Bitcoin wallet",
    installed: typeof window !== "undefined" && !!(window as any).xverse,
  },
  {
    id: "leather",
    name: "Leather",
    icon: "🦊",
    description: "Stacks & Bitcoin wallet",
    installed: typeof window !== "undefined" && !!(window as any).leather,
  },
  {
    id: "okx",
    name: "OKX Wallet",
    icon: "🔵",
    description: "Multi-chain exchange wallet",
    installed: typeof window !== "undefined" && !!(window as any).okxwallet,
  },
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

export const mockAssets: Asset[] = [
  {
    id: "1",
    type: "rune",
    name: "DOG•GO•TO•THE•MOON",
    symbol: "$DOG",
    amount: 5000000,
    image: "🐕",
  },
  {
    id: "2",
    type: "bitmap",
    name: "Bitmap #720143",
    blockNumber: 720143,
    amount: 1,
    image: "🏙️",
  },
  {
    id: "3",
    type: "ordinal",
    name: "Inscription #119366628",
    inscriptionId: "119366628",
    amount: 1,
    image: "🎨",
  },
  {
    id: "4",
    type: "rune",
    name: "UNCOMMON•GOODS",
    symbol: "UNCOMMON",
    amount: 1000,
    image: "💎",
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: "1",
    type: "receive",
    asset: mockAssets[0],
    amount: 1000000,
    from: "bc1p...xyz",
    to: "bc1p...abc",
    status: "completed",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    txid: "abc123...",
  },
  {
    id: "2",
    type: "send",
    asset: mockAssets[1],
    amount: 1,
    from: "bc1p...abc",
    to: "bc1p...def",
    status: "pending",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    txid: "def456...",
  },
];
