import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The signer suite imports the server's own verifier (`app/src/lib/bip322-verify.ts`)
 * so a signer/verifier divergence fails here rather than in someone's first agent.
 *
 * That file lives outside this package, so Node resolves ITS imports by walking up
 * from `app/`, not from here — meaning the suite would only run when `app/` happens
 * to have its dependencies installed. Pointing the shared crypto packages at this
 * package's own copies removes that hidden dependency, and is the resolution we
 * actually want: the point is to prove THIS tree's signer interoperates, on THIS
 * tree's `@noble`/`@scure` versions (pinned to the same ones `app/` uses).
 */
const local = (p: string) => fileURLToPath(new URL(`node_modules/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@noble\/curves\/(.*)$/, replacement: `${local('@noble/curves')}/$1` },
      { find: /^@noble\/hashes\/(.*)$/, replacement: `${local('@noble/hashes')}/$1` },
      { find: '@scure/btc-signer', replacement: local('@scure/btc-signer') },
    ],
  },
});
