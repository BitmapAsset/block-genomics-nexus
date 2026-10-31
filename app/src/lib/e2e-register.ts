// Client helper: register this wallet's DM encryption public key.
//
// POST /api/v1/encryption takes the bound `encryption.register` action message
// (purpose 'encryption', block 0, a hash of { walletAddress, encryptionPubKey })
// and the wallet's signature over it; the nonce inside is used once. Callers
// show a refusal to the user: without a registered key, DMs to this wallet
// cannot be encrypted by the sender.

import { signedActionFetch } from './signed-fetch';

export type RegisterKeyResult = { ok: true } | { ok: false; status: number; error: string };

export async function registerEncryptionKey(opts: {
  walletAddress: string;
  encryptionPubKey: string;
  signMessage: (message: string) => Promise<string>;
}): Promise<RegisterKeyResult> {
  let res: Response;
  try {
    res = await signedActionFetch({
      method: 'POST', path: '/api/v1/encryption', action: 'encryption.register', blockHeight: 0, purpose: 'encryption',
      address: opts.walletAddress,
      body: { walletAddress: opts.walletAddress, encryptionPubKey: opts.encryptionPubKey },
      signMessage: opts.signMessage,
    });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Could not sign the key registration' };
  }
  if (res.ok) return { ok: true };
  const json = await res.json().catch(() => null);
  return { ok: false, status: res.status, error: json?.error || `Key registration failed (HTTP ${res.status})` };
}
