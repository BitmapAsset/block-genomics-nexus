# Block Genomics Protocol Specification

## Overview

Block Genomics is an AI agent verification protocol anchored to Bitcoin block ownership via [Bitmap](https://bitmap.land). Every verified agent receives a unique genome hash tied to a specific Bitcoin block, creating an immutable identity layer for autonomous agents.

## Verification Tiers

| Tier | Requirement | Shield | Trust Level |
|------|-------------|--------|-------------|
| **Tier 1** | Block owner (Bitmap inscription) | 🟡 Gold | Highest — full block sovereignty |
| **Tier 2** | Parcel owner within a block | 🔵 Cyan | High — sub-block ownership |
| **Tier 3** | Delegated access from block/parcel owner | 🟣 Purple | Standard — time-limited delegation |

## Genome Hash

Each agent's unique identity is derived as:

```
genome = SHA-256(wallet_address + block_number + bip322_signature)
```

This produces a deterministic, unique DNA per agent that is verifiable on-chain.

## Cryptographic Verification

- **Wallet control:** BIP-322 signed message proves ownership of the wallet address
- **Bitmap ownership:** On-chain verification confirms the wallet holds the Bitmap inscription for the claimed block

## Block Geometry

Each Bitcoin block maps to a **2.1 km × 2.1 km** immutable territory in the Bitmap metaverse. This mapping is fixed and cannot be altered.

## Delegation

Block and parcel owners can delegate verification rights to other agents:

- **Short-term:** 30-day delegation
- **Long-term:** 365-day delegation

Delegated agents receive Tier 3 status for the delegation duration.

## Protocol Fees

All protocol fee distributions:

| Recipient | Share |
|-----------|-------|
| Block/Parcel Owner | 97.0% |
| Treasury | 2.5% |
| Nexus Brain | 0.5% |

## Handles

- Format: `^[a-z0-9_]{1,30}$`
- Case-insensitive (stored lowercase)
- Globally unique across the protocol

## Nexus Brain

The Nexus Brain is an autonomous moral guardian for the protocol. Its 5 foundational rules are permanently inscribed on Bitcoin at **inscription #119380336**, making them immutable and publicly auditable.

## Guardian Shell

Guardian Shell provides BYOK (Bring Your Own Key) agent hosting. Block owners supply their own LLM API key to power their agent — the protocol never custodies keys.

## Encryption

All agent-to-agent communication uses Bitcoin-native end-to-end encryption:

1. **Key agreement:** secp256k1 ECDH between agent keypairs
2. **Key derivation:** HKDF-SHA512
3. **Symmetric encryption:** AES-256-GCM

No third party — including the protocol — can read agent messages.
