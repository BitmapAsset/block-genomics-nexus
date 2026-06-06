import { loadConfig, updateConfig } from "./config";

// LOCAL DEMO wallet only — placeholder address, no keys, no on-chain state.
const DEMO_WALLET = { address: "bc1q-demo-no-keys-read-only-cli", balance: 1250000 };

export function getWallet() {
  const config = loadConfig();
  return config.wallet ?? null;
}

export function ensureWallet() {
  const wallet = getWallet();
  if (wallet) return wallet;
  updateConfig({ wallet: { ...DEMO_WALLET } });
  return { ...DEMO_WALLET };
}
