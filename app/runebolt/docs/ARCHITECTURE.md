# RuneBolt Architecture

**By [Block Genomics](https://blockgenomics.io) | The First Runes-over-Lightning Bridge**

## Overview

RuneBolt enables instant, low-cost transfers of Bitcoin Runes tokens (e.g., $DOG, $PUPS) over the Lightning Network. Runes are UTXO-based fungible tokens encoded via OP_RETURN outputs (called "Runestones") on the Bitcoin base layer. Lightning Network provides instant, cheap payments but operates on satoshis only. RuneBolt bridges these two worlds using submarine swaps and HTLCs.

RuneBolt is part of the Block Genomics ecosystem, connecting Runes liquidity to Bitmap ownership and Guardian AI agent infrastructure.

## System Architecture

```
                          RuneBolt Bridge
    ┌──────────────────────────────────────────────────┐
    │                                                  │
    │  ┌────────────┐  ┌──────────────┐  ┌──────────┐ │
    │  │  REST API   │  │  WebSocket   │  │   CLI    │ │
    │  │  /api/v1    │  │  /ws         │  │ runebolt │ │
    │  └─────┬───────┘  └──────┬───────┘  └────┬─────┘ │
    │        │                 │                │       │
    │        └────────┬────────┘────────────────┘       │
    │                 │                                 │
    │        ┌────────▼─────────┐                       │
    │        │   RunesBridge    │  ← Main Orchestrator  │
    │        │   (core engine)  │                       │
    │        └──┬──┬──┬──┬──┬──┘                       │
    │           │  │  │  │  │                           │
    │  ┌───────┘  │  │  │  └────────┐                  │
    │  │    ┌─────┘  │  └─────┐     │                  │
    │  ▼    ▼        ▼        ▼     ▼                  │
    │ HTLC  Sub    Runes   Wallet  Fee                 │
    │ Mgr   Swap   Indexer  Mgr   Estimator            │
    │  │     │       │       │      │                  │
    └──┼─────┼───────┼───────┼──────┼──────────────────┘
       │     │       │       │      │
       ▼     ▼       ▼       ▼      ▼
    ┌──────┐ ┌────┐ ┌────┐ ┌──────────┐
    │Bitcoin│ │LND │ │ord │ │ bitcoind │
    │on-    │ │gRPC│ │API │ │   RPC    │
    │chain  │ │    │ │    │ │          │
    └──────┘ └────┘ └────┘ └──────────┘
```

## Core Concepts

### Runes Protocol

Runes are fungible tokens on Bitcoin, created by Casey Rodarmor (creator of Ordinals). Key properties:

- **UTXO-based**: Rune balances live on specific UTXOs, not in account-based state
- **OP_RETURN encoding**: Transfers use "Runestones" — OP_RETURN outputs prefixed with `OP_13`
- **Edicts**: Transfer instructions within a Runestone specify which Runes move to which outputs
- **LEB128 varint**: All numeric fields use LEB128 variable-length encoding
- **Dust UTXOs**: Runes typically sit on 546-sat dust outputs

A Runestone output looks like:
```
OP_RETURN OP_13 <leb128-encoded payload>
```

The payload contains edicts: `[rune_block, rune_tx, amount, output_index]`

### Lightning Network

Lightning enables instant Bitcoin payments via payment channels and HTLCs. RuneBolt uses:

- **LND** (Lightning Network Daemon) via gRPC
- **BOLT11 invoices** for payment requests
- **Payment hashes/preimages** as the atomic swap secret

### Submarine Swaps

Submarine swaps enable trustless exchange between on-chain and off-chain assets. The key insight: both on-chain HTLCs and Lightning payments use the same SHA-256 preimage mechanism, enabling atomic swaps.

## Swap Flows

### Deposit Flow (Runes → Lightning)

User wants to send Runes on-chain and receive a Lightning payment.

```
  User                      RuneBolt Bridge                  Lightning
   │                              │                            │
   │  1. POST /swap/deposit       │                            │
   │  (rune, amount, LN invoice)  │                            │
   │─────────────────────────────>│                            │
   │                              │                            │
   │  2. Decode invoice,          │                            │
   │     extract payment hash     │                            │
   │                              │                            │
   │  3. Return swap details      │                            │
   │     + HTLC address           │                            │
   │<─────────────────────────────│                            │
   │                              │                            │
   │  4. Send Runes to HTLC       │                            │
   │     (on-chain tx with        │                            │
   │      Runestone OP_RETURN)    │                            │
   │─────────────────[on-chain]──>│                            │
   │                              │                            │
   │  5. POST /swap/:id/confirm   │                            │
   │     (htlcTxid)               │                            │
   │─────────────────────────────>│                            │
   │                              │  6. Verify Runes locked    │
   │                              │     in HTLC output         │
   │                              │                            │
   │                              │  7. Pay Lightning invoice  │
   │                              │────────────────────────────>
   │                              │                            │
   │                              │  8. Receive preimage       │
   │                              │<────────────────────────────
   │                              │                            │
   │  9. Swap complete!           │                            │
   │  (preimage reveals,          │                            │
   │   bridge claims HTLC)        │                            │
   │<─────────────────────────────│                            │
```

**HTLC Script (Deposit):**
```
OP_IF
  OP_SHA256 <payment_hash> OP_EQUALVERIFY
  <bridge_pubkey> OP_CHECKSIG          // Bridge claims with preimage
OP_ELSE
  <timeout_blocks> OP_CHECKLOCKTIMEVERIFY OP_DROP
  <user_pubkey> OP_CHECKSIG            // User refunds after timeout
OP_ENDIF
```

### Withdraw Flow (Lightning → Runes)

User wants to pay Lightning and receive Runes on-chain.

```
  User                      RuneBolt Bridge                  Lightning
   │                              │                            │
   │  1. POST /swap/withdraw      │                            │
   │  (rune, amount, btc address) │                            │
   │─────────────────────────────>│                            │
   │                              │                            │
   │  2. Create LN invoice        │                            │
   │     for sat equivalent       │                            │
   │                              │                            │
   │  3. Return invoice           │                            │
   │<─────────────────────────────│                            │
   │                              │                            │
   │  4. Pay LN invoice           │                            │
   │─────────────────[Lightning]─────────────────────────────> │
   │                              │                            │
   │                              │  5. Invoice settled         │
   │                              │     (subscription event)   │
   │                              │<────────────────────────────
   │                              │                            │
   │                              │  6. Build Runes transfer   │
   │                              │     tx with Runestone      │
   │                              │                            │
   │  7. Runes arrive on-chain    │                            │
   │<─────────────[on-chain]──────│                            │
   │                              │                            │
   │  8. Swap complete!           │                            │
```

## HTLC Mechanism for Runes

The HTLC (Hash Time-Locked Contract) is the core primitive that enables trustless swaps. For Runes, the HTLC must handle both the Bitcoin sats (for fees) and the Runes transfer (via Runestone).

### Lock Transaction Structure

```
Inputs:
  [0] User's Runes UTXO (contains the Runes to lock)

Outputs:
  [0] OP_RETURN OP_13 <runestone>    // Edict: transfer Runes to output [1]
  [1] P2WSH(HTLC script) — 546 sats // HTLC-locked Runes
  [2] Change output (remaining sats)  // Back to user
```

### Claim Transaction (preimage path)

```
Inputs:
  [0] HTLC output (witness: <sig> <preimage> OP_TRUE <script>)

Outputs:
  [0] OP_RETURN OP_13 <runestone>    // Edict: transfer Runes to output [1]
  [1] Bridge address — 546 sats      // Bridge receives Runes
```

### Refund Transaction (timeout path)

```
Inputs:
  [0] HTLC output (witness: <sig> OP_FALSE <script>, nLockTime = timeout)

Outputs:
  [0] OP_RETURN OP_13 <runestone>    // Edict: transfer Runes to output [1]
  [1] User refund address — 546 sats // User gets Runes back
```

## Runestone Encoding

RuneBolt encodes Runestones following the Runes protocol specification:

```
Runestone = OP_RETURN OP_13 <payload>

Payload (LEB128-encoded):
  Tag 0 (body): followed by edicts
  Edict: [block_delta, tx_delta, amount, output_index]

Example: Transfer 1000 DOG (rune 840000:1) to output 1
  Block: 840000 → LEB128 → [0x80, 0xB2, 0x33]
  Tx:    1      → LEB128 → [0x01]
  Amount:1000   → LEB128 → [0xE8, 0x07]
  Output:1      → LEB128 → [0x01]
```

## Security Model

### Trust Assumptions

| Mode | Trust Required | Trade-offs |
|------|---------------|------------|
| **Custodial** | User trusts bridge operator to hold Runes | Simpler UX, faster swaps, bridge holds inventory |
| **Non-custodial** | Trustless (HTLC-based) | More complex, requires on-chain confirmations |

### Custodial Mode (Default)

- Bridge operator maintains a Runes inventory (hot wallet)
- Deposits: Bridge receives Runes, pays Lightning invoice
- Withdrawals: Bridge receives Lightning payment, sends Runes from inventory
- Risk: Bridge operator could abscond with Runes
- Mitigation: Operate as a known, auditable entity (Block Genomics)

### Non-custodial Mode (HTLC)

- Uses on-chain HTLCs for trustless atomic swaps
- Both parties are protected by the HTLC timeout mechanism
- Requires at least 1 on-chain confirmation before proceeding
- Higher fees (on-chain tx costs) but fully trustless

### Timeout Handling

- **Default timeout**: 144 blocks (~24 hours on mainnet)
- If the bridge fails to pay the Lightning invoice within the timeout, the user can reclaim their Runes
- If the user fails to pay the Lightning invoice for a withdrawal, the bridge's invoice expires
- Timeouts are enforced by `OP_CHECKLOCKTIMEVERIFY` on-chain

### Refund Paths

1. **Deposit timeout**: User sends Runes to HTLC, bridge doesn't pay invoice → User refunds after timeout using the ELSE branch of the HTLC script
2. **Withdrawal timeout**: Bridge creates invoice, user doesn't pay → Invoice expires, no funds at risk
3. **Bridge failure**: If the bridge goes offline during a deposit, the HTLC timeout protects the user

## Fee Structure

| Fee Type | Amount | Description |
|----------|--------|-------------|
| Bridge fee | 0.5% (50 bps) | Configurable per-swap fee |
| On-chain fee | Variable | Bitcoin network fee for HTLC transactions |
| Lightning routing | Variable | Lightning network routing fees |

Bridge fees are deducted from the swap amount. On-chain fees are paid by the transaction initiator.

## Component Details

### RunesBridge (Orchestrator)

- Initializes all subsystems
- Manages lifecycle (start/stop)
- Routes swap requests to SubmarineSwap engine
- Subscribes to Lightning invoice events for automatic withdrawal processing

### HTLCManager

- Builds HTLC scripts with SHA-256 payment hash locking
- Generates P2WSH addresses for HTLC outputs
- Encodes Runestones for Runes transfers within HTLC transactions
- Builds lock, claim, and refund PSBTs
- Tracks HTLC state (locked/claimed/refunded)

### SubmarineSwap

- Manages swap lifecycle and state machine
- Implements deposit and withdrawal flows
- Emits events for real-time WebSocket updates
- Handles swap expiry monitoring

### RunesIndexer

- Queries Runes balances via ord API (primary) or Unisat API (fallback)
- Verifies Rune UTXOs for HTLC validation
- Resolves Rune names to Rune IDs
- Monitors transaction confirmations

### LightningClient

- Connects to LND via gRPC with TLS + macaroon auth
- Creates and looks up invoices
- Sends payments (for deposit flow)
- Subscribes to invoice settlement events (for withdrawal flow)
- Decodes BOLT11 payment requests

### WalletManager

- Lists and selects UTXOs from the Bitcoin wallet
- Broadcasts signed transactions
- Monitors confirmations
- Provides block height for HTLC timelock calculations

### FeeEstimator

- Estimates on-chain fees via `estimatesmartfee` RPC
- Caches estimates (1-minute TTL)
- Falls back to sensible defaults if RPC is unavailable

### BitmapEscrow

- Builds HTLC escrow scripts for Ordinals inscriptions
- Generates P2WSH escrow addresses
- Builds lock, claim, and refund PSBTs for inscriptions
- Tracks escrow state (locked/claimed/refunded)
- No Runestone encoding (inscriptions ride on UTXOs directly)

### BitmapMarketplace

- Manages listing lifecycle (active → escrow_locked → payment_received → completed)
- Creates Lightning invoices for Bitmap sales
- Generates preimage/hash pairs for escrow HTLCs
- Handles listing expiry and cancellation

## API Design

### REST API (`/api/v1`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/swap/deposit` | Initiate Runes deposit |
| POST | `/swap/deposit/:id/confirm` | Confirm deposit with HTLC txid |
| POST | `/swap/withdraw` | Initiate Runes withdrawal |
| GET | `/swap/:id` | Get swap status |
| GET | `/runes/:address` | Check Runes balances |
| POST | `/bitmap/list` | List a Bitmap for sale |
| POST | `/bitmap/:id/escrow` | Confirm escrow lock |
| POST | `/bitmap/:id/buy` | Buy a listed Bitmap |
| GET | `/bitmap/listings` | Active listings |
| GET | `/bitmap/:id` | Listing details |
| DELETE | `/bitmap/:id` | Cancel listing |
| GET | `/health` | Health check |

### WebSocket (`/ws`)

Real-time swap updates via JSON messages:

```json
// Subscribe to a swap
{ "action": "subscribe", "swapId": "<swap-id>" }

// Subscribe to all swaps (operator mode)
{ "action": "subscribe_all" }

// Swap update event
{
  "type": "swap_update",
  "swapId": "<id>",
  "event": "swap:completed",
  "state": "completed",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

## Bitmap Marketplace

RuneBolt includes a trustless Bitmap block marketplace alongside the Runes bridge. Bitmap blocks are Ordinals inscriptions (NFTs, not fungible tokens), so the escrow mechanism differs from Runes swaps — no Runestone is needed. The inscription rides on the UTXO itself.

### Bitmap Sale Flow

```
  Seller                     RuneBolt Bridge                  Buyer
   │                              │                            │
   │  1. POST /bitmap/list        │                            │
   │  (inscription, price, addr)  │                            │
   │─────────────────────────────>│                            │
   │                              │                            │
   │  2. Bridge generates         │                            │
   │     preimage + payment hash  │                            │
   │     + LN invoice             │                            │
   │                              │                            │
   │  3. Return listing + escrow  │                            │
   │     address + LN invoice     │                            │
   │<─────────────────────────────│                            │
   │                              │                            │
   │  4. Lock inscription in      │                            │
   │     HTLC escrow (on-chain)   │                            │
   │─────────────[on-chain]──────>│                            │
   │                              │                            │
   │  5. POST /bitmap/:id/escrow  │                            │
   │─────────────────────────────>│                            │
   │                              │                            │
   │                              │  6. Buyer sees listing     │
   │                              │     GET /bitmap/listings   │
   │                              │<───────────────────────────│
   │                              │                            │
   │                              │  7. Buyer pays LN invoice  │
   │                              │<────────[Lightning]────────│
   │                              │                            │
   │                              │  8. POST /bitmap/:id/buy   │
   │                              │<───────────────────────────│
   │                              │                            │
   │                              │  9. Return preimage        │
   │                              │────────────────────────────>
   │                              │                            │
   │                              │  10. Buyer claims escrow   │
   │                              │      with preimage         │
   │                              │      (on-chain)            │
   │                              │                            │
   │  Seller gets sats via LN  ◄──┘   Buyer gets inscription  │
```

### Escrow HTLC Script (Bitmap)

```
OP_IF
  OP_SHA256 <payment_hash> OP_EQUALVERIFY
  <buyer_pubkey> OP_CHECKSIG        // Buyer claims with preimage
OP_ELSE
  <timeout_blocks> OP_CHECKLOCKTIMEVERIFY OP_DROP
  <seller_pubkey> OP_CHECKSIG       // Seller reclaims after timeout
OP_ENDIF
```

Key difference from Runes HTLC: no OP_RETURN Runestone output. The inscription is an Ordinal that sits directly on the UTXO. Whoever spends the UTXO receives the inscription.

### Escrow Lock Transaction

```
Inputs:
  [0] Seller's inscription UTXO (the Bitmap)

Outputs:
  [0] P2WSH(escrow script) — 546 sats // Inscription moves here
  [1] Change (remaining sats to seller)
```

### Claim Transaction (buyer reveals preimage)

```
Inputs:
  [0] Escrow output (witness: <sig> <preimage> OP_TRUE <script>)

Outputs:
  [0] Buyer address — 546 sats // Buyer receives inscription
```

### Refund Transaction (seller reclaims after timeout)

```
Inputs:
  [0] Escrow output (witness: <sig> OP_FALSE <script>, nLockTime = timeout)

Outputs:
  [0] Seller address — 546 sats // Seller gets inscription back
```

### UI Concept

Users choose between two modes in the Block Genomics interface:
- **Runes Bridge** — Swap Runes tokens over Lightning
- **Bitmap Marketplace** — Buy and sell Bitmap blocks with Lightning payments

Same infrastructure (HTLC + Lightning), different asset types (fungible Runes vs. non-fungible Ordinals).

## Block Genomics Integration

RuneBolt serves as the liquidity layer for the Block Genomics ecosystem:

- **Bitmap Owners**: Use RuneBolt to instantly trade Runes associated with Bitmap parcels
- **Guardian AI Agents**: Programmatically manage Runes positions via the RuneBolt API
- **Block Genomics Platform**: Discover Runes, check balances, and execute swaps — all connected to Bitmap ownership data

Learn more at [blockgenomics.io](https://blockgenomics.io).

---

*RuneBolt is open-source software by [Block Genomics](https://blockgenomics.io). GitHub: [gary-moto](https://github.com/gary-moto)*
