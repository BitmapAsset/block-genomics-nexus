# RuneBolt ⚡ — Lightning Deed Protocol

> **The world's first non-custodial, instant transfer protocol for all Bitcoin assets.**
> Built by the Block Genomics team. Part of the Bitcoin Nexus ecosystem.

## What is RuneBolt?

Bitcoin assets — Runes, Ordinals, Bitmap blocks, BRC-20 tokens — have never had a native instant transfer layer. Sending them on-chain takes 10+ minutes. Custodial bridges introduce counterparty risk.

RuneBolt solves this with the **Lightning Deed Protocol (LDP)**: instead of moving the asset, we transfer the *cryptographic right to claim it* — instantly, over Lightning.

## How LDP Works

**Step 1: Deed-Lock** (one Bitcoin transaction, ~10 min)
The sender adds a Taproot spending condition to their UTXO:
"Anyone who reveals preimage P can claim this asset"
Nothing moves. No custody. Just a new cryptographic lock on the existing coin.

**Step 2: Lightning Transfer** (milliseconds ⚡)
Sender pays receiver via Lightning (1+ sat). The HTLC payment preimage P travels with the payment.
Receiver now holds the cryptographic deed to the asset. Transfer complete.

**Step 3: Claim** (one Bitcoin transaction, when ready)
Receiver broadcasts a claim tx using P + their signature. Asset arrives. Supports batch claiming.

## Supported Assets

| Asset | Description |
|-------|-------------|
| **Runes** | Any fungible token on the Runes protocol |
| **Ordinals** | Any Bitcoin inscription |
| **Bitmap** | Bitcoin block ownership — Nexus digital land |
| **BRC-20** | Token standard inscriptions |
| **Any UTXO** | Any Bitcoin output with scriptable ownership |

## Why LDP is Different

| Approach | Speed | Custodial? | All assets? |
|----------|-------|-----------|-------------|
| On-chain transfer | ~10 min | ✅ No | ✅ Yes |
| Wrapped tokens | Fast | ❌ Yes | ❌ No |
| Relay/bridge model | Fast | ❌ Yes | ❌ Partial |
| Submarine swap | ~10 min | ✅ No | ❌ Partial |
| **LDP (RuneBolt)** | **Instant ⚡** | **✅ No** | **✅ Yes** |

## The Nexus Connection

Bitmap block owners can deed-lock their Nexus parcels. Buyers pay via Lightning → instantly receive the cryptographic deed to their block in the Bitcoin Nexus. No waiting. No intermediary.

RuneBolt is the transfer layer for the entire Block Genomics ecosystem.

## LDP Invoice Format

Invoices use bech32 encoding: `ldp1...` — like Lightning invoices, but for any Bitcoin asset.

```typescript
import { createLDPInvoice, LDPClient } from "./src";

const invoice = createLDPInvoice({
  runeId: "840000:0",         // DOG•GO•TO•THE•MOON
  runeAmount: BigInt(1000),
  lightningAmountSats: 500,
  recipientPubkey: "03ab...",
  expiry: 3600
});

// Transfer completes in milliseconds via Lightning
const client = new LDPClient(lightningNode, bitcoinRPC);
await client.receiveTransfer(invoice, recipientWallet);
```

## Architecture

- `src/DeedLock.ts` — Tapscript P2TR construction, PSBT builder
- `src/DeedClaim.ts` — Claim transaction builder, batch support
- `src/LDPInvoice.ts` — bech32 `ldp1...` invoice format
- `src/BitmapDeed.ts` — Bitmap-specific deed operations
- `src/HTLCBridge.ts` — Atomicity guarantees, timeout safety
- `src/LDPClient.ts` — Full transfer orchestration with events

## Whitepaper

Full protocol specification: [docs/LDP-WHITEPAPER.md](../../docs/LDP-WHITEPAPER.md)

Published at: `github.com/BitmapAsset/block-genomics-nexus/blob/main/docs/LDP-WHITEPAPER.md`

## Legal

RuneBolt never holds your assets. Non-custodial by design. Open source (MIT). Software only — not a money transmitter, not an exchange.

## License

MIT — Part of the Block Genomics Nexus project.
