# 🔐 Wallet Integration — Technical Spec

## Overview
Users must prove they own a Bitmap inscription to register as a Tier 1 verified agent. This requires connecting an Ordinals-compatible Bitcoin wallet and signing a verification challenge.

## Supported Wallets

### 1. Unisat Wallet (Primary)
- **Why:** Most popular Ordinals wallet, largest user base
- **SDK:** `window.unisat` (browser extension API)
- **Docs:** https://docs.unisat.io
- **Features:** Sign message, get inscriptions, get balance
- **Detection:** `typeof window.unisat !== 'undefined'`

```javascript
// Connect
const accounts = await window.unisat.requestAccounts();
const address = accounts[0];

// Get inscriptions (check for Bitmap)
const inscriptions = await window.unisat.getInscriptions(0, 100);
const bitmaps = inscriptions.list.filter(i => 
  i.content && i.content.endsWith('.bitmap')
);

// Sign verification message
const message = `Block Genomics Verification\nBlock: ${blockHeight}\nTimestamp: ${Date.now()}\nNonce: ${nonce}`;
const signature = await window.unisat.signMessage(message);
```

### 2. Xverse Wallet
- **Why:** Second most popular, good mobile support
- **SDK:** `@sats-connect/core`
- **Docs:** https://docs.xverse.app
- **Detection:** Sats Connect protocol

```javascript
import { getAddress, signMessage } from 'sats-connect';

// Connect
await getAddress({
  payload: { purposes: ['ordinals'], message: 'Connect to Block Genomics' },
  onFinish: (response) => { address = response.addresses[0].address; }
});

// Sign
await signMessage({
  payload: { address, message: challengeMessage },
  onFinish: (response) => { signature = response; }
});
```

### 3. Leather Wallet
- **Why:** Bitcoin and Stacks wallet with Ordinals support (formerly "Hiro Wallet")
- **SDK:** `window.LeatherProvider.request(method, params)`; `window.btc` is the deprecated pre-2024 alias
- **Docs:** https://leather.gitbook.io/developers (checked 2026-10-18)
- **Methods we call:** `getAddresses` (connect, once, on a user action) and `signMessage` with `paymentType: 'p2tr'` (BIP-322)
- **Note:** `getAddresses` is a connection request, not a query: every call re-opens Leather's approval prompt, so never poll it

## Verification Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. Connect  │ ──→ │ 2. Detect    │ ──→ │  3. Sign     │ ──→ │  4. Verify   │
│   Wallet     │     │   Bitmaps    │     │   Challenge  │     │   On-Chain   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                     │                     │                     │
  User clicks         Query wallet          Generate unique      Verify signature
  "Connect"          for inscriptions       challenge msg        matches Bitmap
                    filter for .bitmap       User signs          owner address
                     inscriptions           with wallet          Query indexer
```

## Challenge Message Format
```
Block Genomics Agent Verification
===================================
Action: register_agent
Block: {blockHeight}
Agent: {agentName}
Timestamp: {ISO-8601}
Nonce: {random-32-bytes-hex}
Chain: bitcoin-mainnet
===================================
Sign this message to verify you own Bitmap #{blockHeight}
```

## Bitmap Detection
A valid Bitmap inscription:
- Content type: `text/plain`
- Content: `{blockHeight}.bitmap` (e.g., "800000.bitmap")
- Must be owned by the connected wallet address

## Indexer APIs for Cross-Verification

The app reads chain truth from two public sources and decides deeds itself. No
indexer API key is needed.

### Address -> inscriptions held
```
GET https://mempool.space/api/address/{address}/utxo     (Esplora; blockstream.info/api is the fallback)
GET https://ordinals.com/r/utxo/{txid}:{vout}             -> { inscriptions: [...] }
```

### Inscription -> holder, body
```
GET https://ordinals.com/r/inscription/{inscriptionId}    -> address, satpoint, height, content_type
GET https://ordinals.com/content/{inscriptionId}          -> "840000.bitmap"
```

These are ord's recursive endpoints, which carry ord's backwards-compatibility
promise. The non-recursive JSON API (`/inscription/{id}`, `/address/{addr}`) is
disabled on ordinals.com (HTTP 406), and `ORD_BASE_URL` can point the app at a
self-hosted ord.

### Which copy is the deed
Several inscriptions can say "840000.bitmap"; only the first valid one is the
deed. `packages/bitmap-resolver` decides that (OCI below block 942,000, a
self-verified block walk above it) and emits a proof bundle anyone can re-check.

### Retired sources
- **Hiro Ordinals API** (`api.hiro.so/ordinals/v1`): shut down by Hiro on 2026-03-09, answers HTTP 410. Removed from the engine and the legacy verify page (issue #211); the app had already moved off it.
- **ord.io API**: the host no longer resolves (checked 2026-10-18).
- **BestInSlot API** (`api.bestinslot.xyz`): now redirects to an unrelated domain (checked 2026-10-18). Do not call it.

## Security Considerations
1. **Replay protection:** Nonce + timestamp in challenge (valid for 5 minutes)
2. **Signature verification:** Verify using bitcoinjs-message library
3. **Address matching:** Signed address must match Bitmap inscription owner
4. **Inscription validity:** Verify inscription content format matches "{height}.bitmap"
5. **Current ownership:** Always check current owner (inscriptions can be transferred)
