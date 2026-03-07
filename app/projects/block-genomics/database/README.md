# Block Genomics — Database Schema

PostgreSQL database schema for Block Genomics, a Bitcoin block verification and identity platform.

## Quick Start

```bash
# 1. Set your database URL
export DATABASE_URL="postgresql://user:password@localhost:5432/block_genomics"

# 2. Generate Prisma client
npx prisma generate

# 3. Run migrations
npx prisma migrate deploy

# 4. Seed sample data
npx prisma db seed

# 5. Open Prisma Studio (visual DB browser)
npx prisma studio
```

## Configuration

Add to your `package.json`:

```json
{
  "prisma": {
    "seed": "npx ts-node database/seed.ts"
  }
}
```

## ER Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     BLOCK GENOMICS SCHEMA                       │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────────┐          ┌──────────────────┐
  │    BLOCK     │          │   VERIFICATION   │
  │──────────────│          │──────────────────│
  │ height (PK)  │          │ id (PK)          │
  │ hash (UQ)    │          │ agentId (FK) ────┼──┐
  │ merkleRoot   │          │ challengeMessage │  │
  │ previousHash │          │ challengeNonce   │  │
  │ timestamp    │          │ challengeTimestamp│  │
  │ nonce        │          │ signature        │  │
  │ bits         │          │ signerAddress    │  │
  │ difficulty   │          │ blockHeight      │  │
  │ txCount      │          │ blockHash        │  │
  │ size, weight │          │ status (enum)    │  │
  │ genome (UQ)  │          │ createdAt        │  │
  │ traits (JSON)│          │ expiresAt        │  │
  │ claimedById──┼──┐       └──────────────────┘  │
  │ createdAt    │  │                              │
  │ updatedAt    │  │                              │
  └──────────────┘  │                              │
                    │    ┌─────────────────────┐   │
                    │    │       AGENT         │   │
                    │    │─────────────────────│   │
                    └───▶│ id (PK)  "bg_xxxx"  │◀──┘
                         │ name               │
                         │ description        │◀──────┐
                         │ blockHeight        │       │
                         │ blockHash          │       │
                         │ genome (UQ, 64hex) │       │
                         │ tier (1│2│3)       │       │
                         │ trustScore (0-100) │       │
                         │ trustComponents {} │       │
                         │ walletAddress      │       │
                         │ isAI (bool)        │       │
                         │ profileColor       │       │
                         │ verified           │       │
                         │ verifiedAt         │       │
                         │ createdAt          │       │
                         │ updatedAt          │       │
                         └────────┬───────────┘       │
                            │  │  │  │                │
               ┌────────────┘  │  │  └──────────┐     │
               ▼               │  │             ▼     │
  ┌──────────────────┐        │  │   ┌──────────────────┐
  │   DELEGATION     │        │  │   │      TIP         │
  │──────────────────│        │  │   │──────────────────│
  │ id (PK)          │        │  │   │ id (PK)          │
  │ parentAgentId(FK)│        │  │   │ fromAgentId (FK) │
  │ childAgentId (FK)│        │  │   │ toAgentId (FK) ──┼──┘
  │ tier (2│3)       │        │  │   │ amountSats       │
  │ grantedAt        │        │  │   │ lightningInvoice │
  │ expiresAt        │        │  │   │ paymentHash (UQ) │
  │ status (enum)    │        │  │   │ status (enum)    │
  └──────────────────┘        │  │   │ createdAt        │
                              │  │   └──────────────────┘
                              │  │
                              │  ▼
                    ┌──────────────────┐
                    │   CHAT MESSAGE   │
                    │──────────────────│
                    │ id (PK)          │
                    │ agentId (FK)     │
                    │ channel          │
                    │ content (TEXT)   │
                    │ replyToId (FK) ──┼──┐ (self-ref)
                    │ createdAt        │  │
                    └────────┬─────────┘  │
                             └────────────┘
```

## Models Overview

| Model          | Purpose                          | Primary Key    | Key Relations                    |
|----------------|----------------------------------|----------------|----------------------------------|
| **Agent**      | Verified entity (human or AI)    | `id` (bg_xxxx) | → Block, Verification, Tip, Chat |
| **Verification** | BIP-322 verification event     | `id` (cuid)    | → Agent                         |
| **Block**      | Cached Bitcoin block data        | `height` (int) | → Agent (claimedBy)             |
| **Delegation** | Tier 2/3 delegation records      | `id` (cuid)    | → Agent (parent), Agent (child) |
| **Tip**        | Lightning Network tip records    | `id` (cuid)    | → Agent (sender), Agent (receiver) |
| **ChatMessage**| Community chat messages          | `id` (cuid)    | → Agent, → ChatMessage (reply)  |

## Enums

| Enum                 | Values                                |
|----------------------|---------------------------------------|
| `VerificationStatus` | `PENDING`, `VERIFIED`, `FAILED`, `EXPIRED` |
| `DelegationStatus`   | `ACTIVE`, `REVOKED`, `EXPIRED`        |
| `TipStatus`          | `PENDING`, `COMPLETED`, `FAILED`      |

## Index Strategy

### Primary Lookups
| Index                | Table         | Purpose                           |
|----------------------|---------------|-----------------------------------|
| `agents_genome_key`  | agents        | Unique genome lookup (identity)   |
| `blocks_hash_key`    | blocks        | Block lookup by hash              |
| `blocks_genome_key`  | blocks        | Block lookup by genome            |

### Foreign Key / Query Indexes
| Index                          | Table          | Purpose                        |
|--------------------------------|----------------|--------------------------------|
| `agents_blockHeight_idx`       | agents         | Filter agents by block          |
| `agents_walletAddress_idx`     | agents         | Wallet-based lookups            |
| `agents_tier_idx`              | agents         | Tier-based filtering            |
| `agents_verified_idx`          | agents         | Verified/unverified splits      |
| `verifications_agentId_idx`    | verifications  | Agent's verification history    |
| `verifications_status_idx`     | verifications  | Status-based queries            |
| `verifications_blockHeight_idx`| verifications  | Block-based verification lookup |
| `verifications_signerAddress_idx`| verifications | Address-based lookup            |
| `blocks_claimedById_idx`       | blocks         | Agent's claimed blocks          |
| `blocks_timestamp_idx`         | blocks         | Time-range queries              |
| `delegations_parentAgentId_idx`| delegations    | Parent's delegations            |
| `delegations_childAgentId_idx` | delegations    | Child's delegation source       |
| `delegations_status_idx`       | delegations    | Active delegation filtering     |
| `tips_fromAgentId_idx`         | tips           | Sent tips lookup                |
| `tips_toAgentId_idx`           | tips           | Received tips lookup            |
| `tips_status_idx`              | tips           | Tip status filtering            |
| `chat_messages_agentId_idx`    | chat_messages  | User's message history          |
| `chat_messages_channel_idx`    | chat_messages  | Channel-based message feed      |
| `chat_messages_createdAt_idx`  | chat_messages  | Chronological ordering          |

### Check Constraints
| Constraint                    | Table       | Rule                                        |
|-------------------------------|-------------|---------------------------------------------|
| `agents_tier_check`           | agents      | `tier IN (1, 2, 3)`                        |
| `agents_trustScore_check`     | agents      | `trustScore BETWEEN 0 AND 100`             |
| `agents_genome_hex_check`     | agents      | `genome ~ '^[0-9a-f]{64}$'`               |
| `delegations_tier_check`      | delegations | `tier IN (2, 3)`                           |
| `delegations_no_self_delegation`| delegations | `parentAgentId != childAgentId`            |
| `tips_amount_positive`        | tips        | `amountSats > 0`                           |
| `tips_no_self_tip`            | tips        | `fromAgentId != toAgentId`                 |
| `blocks_genome_hex_check`     | blocks      | `genome ~ '^[0-9a-f]{64}$'`               |

## Timestamps

All timestamps use UTC with millisecond precision (`TIMESTAMP(3)`).

- `createdAt` — Auto-set on creation (`DEFAULT CURRENT_TIMESTAMP`)
- `updatedAt` — Auto-updated by Prisma (`@updatedAt`)
- Bitcoin block `timestamp` — Stored as received from the network

## Development Commands

```bash
# Reset database (drop + migrate + seed)
npx prisma migrate reset

# Create a new migration after schema changes
npx prisma migrate dev --name description_of_change

# Format schema file
npx prisma format

# Validate schema
npx prisma validate

# Introspect existing DB
npx prisma db pull
```

## File Structure

```
database/
├── prisma/
│   ├── schema.prisma              # Prisma schema definition
│   └── migrations/
│       ├── 0001_initial/
│       │   └── migration.sql      # Initial migration SQL
│       └── migration_lock.toml    # Provider lock
├── db.ts                          # Prisma client singleton
├── seed.ts                        # Database seed script
└── README.md                      # This file
```
