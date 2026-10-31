// What a DM puts on the wire. With the sender's key ready and a recipient key
// on file, ciphertext; otherwise plain text only when the sender confirmed it
// (`allowPlaintext`), so a DM is never downgraded silently. The server stores
// whatever is sent here, in clear when it is not encrypted.

import type { EncryptedMessage } from './e2e-crypto';

export type DmPayload =
  | { ok: true; encrypted: boolean; text: string; type: string }
  | { ok: false; reason: 'not_encrypted_needs_confirm' };

export async function prepareDmPayload(opts: {
  text: string;
  /** The sender's own keypair is set up. */
  ready: boolean;
  /** Handle or wallet of the recipient, if known. */
  recipient: string | null | undefined;
  encrypt: (text: string, recipient: string) => Promise<EncryptedMessage | null>;
  /** The sender confirmed sending without end-to-end encryption. */
  allowPlaintext?: boolean;
}): Promise<DmPayload> {
  if (opts.ready && opts.recipient) {
    const encrypted = await opts.encrypt(opts.text, opts.recipient);
    if (encrypted) return { ok: true, encrypted: true, text: JSON.stringify(encrypted), type: 'encrypted' };
  }
  if (!opts.allowPlaintext) return { ok: false, reason: 'not_encrypted_needs_confirm' };
  return { ok: true, encrypted: false, text: opts.text, type: opts.text.startsWith('http') ? 'link' : 'text' };
}

/** The confirm text the DM composers show before a plain-text send. */
export const UNENCRYPTED_DM_CONFIRM =
  'This message will NOT be end-to-end encrypted: the recipient has no encryption key on file ' +
  '(or yours is not set up). Block Genomics will store it as plain text. Send it anyway?';
