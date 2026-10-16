/**
 * Open the header's Connect modal from anywhere (WalletConnect listens for this
 * event). One wallet picker for the whole app, so every entry point offers the
 * same five wallets with the same install links.
 *
 * `next`: where to go once a wallet connects (e.g. "/my-bitmaps" from Home).
 */
export function openWalletModal(next?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("open-wallet-modal", { detail: next ? { next } : undefined }));
}
