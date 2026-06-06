// Pluggable signer contract.
//
// Block Genomics never sees an agent's private key. Any runtime — Hermes, an
// OpenClaw agent, a browser wallet extension, a hardware signer, a custodial
// service — brings its OWN Bitcoin signer by implementing this interface. The
// SDK only ever asks it to (a) report its address and (b) produce a BIP-322
// signature over an exact message string.

export interface BitcoinSigner {
  /** The Bitcoin address (bech32 / taproot bc1p...) this signer controls. */
  readonly address: string;

  /**
   * Produce a BIP-322 signature over `message` using the wallet at `address`.
   * Must return the base64 signature string the Block Genomics API expects.
   * Throw if the user/agent rejects or signing fails.
   */
  signMessage(message: string): Promise<string>;
}

/**
 * Minimal callback-style signer adapter, for runtimes that already have a
 * "sign this string" function (e.g. a wallet bridge or an in-house KMS).
 *
 *   const signer = makeSigner(myAddress, (msg) => wallet.signBip322(msg));
 */
export function makeSigner(
  address: string,
  signMessage: (message: string) => Promise<string> | string,
): BitcoinSigner {
  return {
    address,
    signMessage: async (message: string) => signMessage(message),
  };
}
