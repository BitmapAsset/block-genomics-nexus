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

### 3. Leather (Hiro) Wallet
- **Why:** Stacks ecosystem, growing Ordinals support
- **SDK:** `window.LeatherProvider` or `window.btc`
- **Docs:** https://leather.io/docs

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

### Option A: Ord.io API
```
GET https://api.ord.io/inscription/{inscriptionId}
→ Returns: owner address, content, inscription number
```

### Option B: Hiro Ordinals API
```
GET https://api.hiro.so/ordinals/v1/inscriptions?address={address}
→ Returns: list of inscriptions with content
```

### Option C: BestInSlot API
```
GET https://api.bestinslot.xyz/v3/bitmap/block/{blockHeight}
→ Returns: Bitmap inscription details and owner
```

## Security Considerations
1. **Replay protection:** Nonce + timestamp in challenge (valid for 5 minutes)
2. **Signature verification:** Verify using bitcoinjs-message library
3. **Address matching:** Signed address must match Bitmap inscription owner
4. **Inscription validity:** Verify inscription content format matches "{height}.bitmap"
5. **Current ownership:** Always check current owner (inscriptions can be transferred)
