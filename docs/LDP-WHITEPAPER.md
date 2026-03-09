# Lightning Deed Protocol: Non-Custodial Instant Transfer for All Bitcoin Assets

**Version 0.1.0 — RuneBolt Project**

## Abstract

The Lightning Deed Protocol (LDP) is a transfer protocol for Bitcoin-native assets — Runes, Ordinals, Bitmap inscriptions, BRC-20 tokens, and any UTXO-based asset on Bitcoin. LDP achieves instant, non-custodial, trustless transfers by binding Taproot hash-lock scripts to Lightning Network HTLC preimages. Instead of moving assets through payment channels or custodial bridges, LDP transfers the cryptographic right to claim an asset at Lightning speed while the asset itself remains secured by Bitcoin consensus.

LDP is infrastructure for the entire Bitcoin asset ecosystem: any asset that lives on a Bitcoin UTXO can be transferred using this protocol.

## The Problem

Bitcoin-native assets — Runes, Ordinals, Bitmap parcels, BRC-20 tokens — live on-chain as UTXOs. Transferring them requires a Bitcoin transaction: 10+ minutes for one confirmation, often more for finality. There is no native way to send these assets through Lightning channels because Lightning operates on payment channels, not arbitrary UTXO transfers.

Existing approaches all compromise on something:

- **Wrapping** (Taproot Assets): Requires minting a synthetic representation of the asset on a separate protocol layer. This introduces custodial trust, protocol complexity, and the wrapped asset is not the original. Not all asset types are supported.
- **Relay/Bridge models**: Require a trusted intermediary to hold assets during transit. If the relay goes offline or acts maliciously, assets are at risk. Requires custodial inventory — capital-intensive and risky.
- **Submarine swaps**: Solve the Lightning-to-on-chain bridge for BTC, but do not handle Rune metadata, ordinal sat positioning, or inscription preservation. They are limited to BTC-denominated swaps.

None of these approaches deliver instant, trustless, non-custodial transfer of the actual on-chain asset across all Bitcoin asset types.

## The Insight

We do not need to move the asset through Lightning. We only need to transfer the **cryptographic right to claim** the asset. Lightning already has the perfect mechanism for instant, atomic secret revelation: the HTLC payment preimage.

By constructing a Tapscript spending condition that requires the same preimage used in a Lightning payment, we bind Bitcoin script enforcement to Lightning speed. The asset never leaves L1. Only the deed key travels through Lightning.

## The Mechanism

### Step 1: Deed-Lock

The sender adds a Tapscript spending condition to their asset UTXO. This creates a Taproot output with two spending paths:

**Claim path** (for recipient):
```
OP_SHA256 <payment_hash> OP_EQUALVERIFY <recipient_pubkey> OP_CHECKSIG
```

**Recovery path** (for sender, after timeout):
```
<timeout_blocks> OP_CHECKSEQUENCEVERIFY OP_DROP <sender_pubkey> OP_CHECKSIG
```

These two scripts form the leaves of a Taproot script tree. The UTXO is sent to the resulting P2TR address. No asset movement occurs yet — the asset sits in the deed-locked output, spendable by whoever reveals the preimage.

### Step 2: Lightning Transfer

The sender creates a Lightning HTLC using the **same payment hash** as the deed-lock script. The recipient receives a Lightning payment (1+ sat). Upon settlement, the payment preimage is revealed to the recipient instantly (milliseconds).

This is the critical binding: the Lightning payment hash and the Bitcoin deed-lock hash are identical. Revealing the preimage on one side unlocks both.

### Step 3: Claim

The recipient now holds the preimage. They construct a Bitcoin transaction that spends the deed-locked UTXO via the claim path: provide the preimage (satisfies `OP_SHA256 ... OP_EQUALVERIFY`) and their signature (satisfies `OP_CHECKSIG`). The asset moves to the recipient's address on-chain.

### Step 4: Atomicity Guarantee

The protocol is atomic because of timeout ordering. The Lightning HTLC **must** expire before the Bitcoin CSV timelock. This means:

- If the Lightning payment succeeds → recipient gets the preimage → they can always claim before the Bitcoin timeout.
- If the Lightning payment fails → preimage is never revealed → sender recovers the UTXO after the timeout.
- If the sender tries to recover early → the CSV timelock prevents it.

The sender cannot double-spend: after deed-locking, the UTXO is committed. They either lose the Lightning sats (if the payment succeeds and the recipient claims) or they wait for the timeout to recover. There is no window where the sender keeps both the sats and the asset.

## Non-Custodial and Trustless

At no point does any third party hold the asset. The deed-lock is a Bitcoin script — enforced by the Bitcoin network itself. The Lightning payment is a standard HTLC — enforced by the Lightning Network. The atomic binding between them is cryptographic (same SHA256 hash), not institutional.

The recipient does not need to trust the sender, a bridge, a relay, or any intermediary. They verify the deed-lock script on-chain, confirm the payment hash matches, and know that receiving the Lightning payment guarantees their ability to claim.

## Applications

### Runes

Any fungible Rune token ($DOG, $PEPE, UNCOMMON*GOODS, or any future Rune) can be deed-locked and transferred via LDP. Market makers, OTC desks, and peer-to-peer traders can settle Rune trades instantly without waiting for block confirmations. The Rune itself — including all protocol metadata — never leaves Bitcoin L1.

### Ordinals

Individual inscriptions (images, text, HTML, recursive inscriptions, BRC-420 modules) can be transferred via LDP. High-value inscriptions benefit most: the deed-lock script serves as trustless escrow enforced by Bitcoin consensus, eliminating the need for marketplace intermediaries.

### Bitmap & Nexus

Bitmap assigns ownership of Bitcoin blocks as digital land. Block owners can deed-lock parcels within their Nexus blocks — buyers pay via Lightning and instantly receive the deed key to claim their parcel on-chain. LDP becomes the transfer infrastructure for the entire Bitmap metaverse: sovereign digital land that moves at Lightning speed.

This is particularly powerful for Nexus development: builders can purchase parcels, trade positions, and assemble contiguous land holdings without waiting for block confirmations between each trade.

### BRC-20

BRC-20 tokens (ordi, sats, rats, and others) are inscription-based fungible tokens. Because they exist as UTXOs, they are fully compatible with LDP deed-locking. BRC-20 transfers that previously required inscription indexer confirmation can now settle via Lightning preimage revelation.

### Any UTXO-Based Asset

LDP is not limited to known asset types. Any Bitcoin UTXO with a scriptable spending condition — present or future — can be deed-locked. As the Bitcoin asset ecosystem evolves, LDP adapts without protocol changes.

## Why This Is Novel

Taproot hash-locks and Lightning HTLCs both use SHA256 preimages — but nobody has connected them for the purpose of arbitrary Bitcoin asset transfer. Submarine swaps use a similar hash-lock bridge for BTC-to-Lightning swaps, but they do not handle Rune protocol metadata, ordinal sat positioning, or inscription preservation.

LDP extends this pattern to all Bitcoin-native assets: any UTXO-based asset can be deed-locked and transferred via Lightning preimage revelation. The asset never leaves Bitcoin L1 — only the right to claim it travels at Lightning speed.

## Comparison

| Approach | Speed | Custody | Trust | Actual Asset | All Asset Types |
|----------|-------|---------|-------|-------------|-----------------|
| On-chain transfer | ~10 min | Self | Trustless | Yes | Yes |
| Taproot Assets wrap | Instant | Third-party | Protocol trust | No (wrapped) | Limited |
| Relay/Bridge | Minutes | Bridge | Bridge trust | Yes | Limited |
| Submarine swap | ~10 min | Self | Trustless | BTC only | No |
| **LDP (this protocol)** | **Instant** | **Self** | **Trustless** | **Yes** | **Yes** |

## Investment & Economics

LDP is radically capital-efficient compared to alternative approaches:

- **Lightning cost per transfer**: 1-10 sats. The Lightning payment exists solely to carry the preimage — the amount is negligible.
- **No custodial inventory**: Unlike relay/bridge models, no party needs to hold asset reserves. The sender's own UTXO is the source of truth.
- **No liquidity pools**: Unlike wrapped token models, no liquidity must be deposited and locked. Each transfer is self-contained.
- **On-chain costs**: One Bitcoin transaction to deed-lock (sender), one to claim (recipient). These are standard Taproot spends — among the cheapest transaction types on Bitcoin.
- **Batch claiming**: Multiple deed-locked UTXOs can be claimed in a single transaction, reducing per-transfer on-chain cost further.

The total cost of an LDP transfer is: one on-chain tx fee (deed-lock) + 1-10 sats Lightning + one on-chain tx fee (claim). No protocol fees, no bridge fees, no wrapping fees. This makes LDP sustainable at any scale — costs are borne by the transacting parties and paid directly to Bitcoin miners and Lightning routing nodes.

## Conclusion

The Lightning Deed Protocol enables instant transfer of Bitcoin-native assets without wrapping, bridging, or custodial intermediaries. By binding Taproot hash-lock scripts to Lightning payment preimages, LDP transfers the cryptographic right to claim an asset at Lightning speed while the asset itself remains secured by Bitcoin consensus.

LDP is not a tool for a single token. It is transfer infrastructure for all of Bitcoin — every Rune, every inscription, every Bitmap parcel, every BRC-20 token, and every future asset type that lives on a Bitcoin UTXO. The protocol requires no changes to Bitcoin, no changes to Lightning, and no trusted third parties. It works today.

---

*Published at: [github.com/BitmapAsset/block-genomics-nexus/blob/main/docs/LDP-WHITEPAPER.md](https://github.com/BitmapAsset/block-genomics-nexus/blob/main/docs/LDP-WHITEPAPER.md)*
