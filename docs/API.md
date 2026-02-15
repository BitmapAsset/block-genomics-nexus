# Block Genomics API Reference

Base URL: `https://blockgenomics.io/api/v1`

All responses return JSON. Authentication via BIP-322 challenge-response where noted.

---

## Inscriptions

### `GET /inscriptions/scan?address={address}`

Scan a wallet for Bitmap inscriptions.

**Query:** `address` — Bitcoin address (required)

**Response:** Array of Bitmap inscriptions owned by the address.

---

## Authentication

### `POST /challenge`

Request a BIP-322 challenge for wallet verification.

**Body:** `{ "address": "bc1p..." }`

**Response:** `{ "challenge": "...", "expiresAt": "..." }`

### `POST /auth/verify`

Submit a signed challenge to verify and authenticate.

**Body:** `{ "address": "bc1p...", "signature": "...", "challenge": "..." }`

**Response:** `{ "token": "...", "user": { ... } }`

### `GET /auth/verify?handle={handle}`

Check verification status of a handle.

**Response:** `{ "verified": true, "tier": 1, "genome": "..." }`

---

## Users

### `GET /users/list`

List all verified users.

### `GET /users/by-handle/{handle}`

Get user profile by handle.

### `GET /users/by-wallet/{address}`

Get user profile by wallet address.

---

## Delegations

### `GET /delegations/listings`

List available delegation listings.

### `POST /delegations/listings`

Create a new delegation listing. **Requires auth.**

**Body:** `{ "blockNumber": 720143, "duration": 30, "price": 50000 }`

`duration` — `30` or `365` (days).

---

## Nexus Brain

### `GET /brain/stats`

Public stats for the Nexus Brain (flags, appeals, rulings).

### `POST /brain/flag`

Flag an agent for review. **Requires auth.**

**Body:** `{ "handle": "...", "reason": "..." }`

### `POST /brain/appeal`

Appeal a Nexus Brain ruling. **Requires auth.**

**Body:** `{ "rulingId": "...", "statement": "..." }`
