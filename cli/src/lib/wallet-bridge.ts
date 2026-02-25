import { loadConfig, updateConfig } from "./config";

export function getWallet() {
  const config = loadConfig();
  if (!config.wallet) {
    return null;
  }
  return config.wallet;
}

export function ensureWallet() {
  const wallet = getWallet();
  if (wallet) return wallet;
  const created = { address: "bc1qmockwalletaddressxyz", balance: 1250000 };
  updateConfig({ wallet: created });
  return created;
}

export function updateBalance(delta: number) {
  const wallet = ensureWallet();
  const next = { ...wallet, balance: wallet.balance + delta };
  updateConfig({ wallet: next });
  return next.balance;
}
