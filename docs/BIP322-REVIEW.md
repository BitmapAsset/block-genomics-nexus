# 🔏 BIP-322 Implementation Review — Block Genomics

**Date:** February 6, 2026
**Scope:** BIP-322 message signing usage in `verify/app.js` and protocol spec
**Reference:** [BIP-322: Generic Signed Message Format](https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki)

---

## 1. BIP-322 Background

BIP-322 defines a **generic message signing/verification scheme** for Bitcoin, superseding the legacy `signmessage` (which only works for P2PKH — legacy addresses starting with `1`). BIP-322 supports:

- **P2PKH** (legacy: `1...`)
- **P2SH-P2WPKH** (wrapped SegWit: `3...`)
- **P2WPKH** (native SegWit: `bc1q...`)
- **P2TR** (Taproot: `bc1p...`) — via the "simple" variant

### BIP-322 "Simple" Variant

The "simple" variant (what Block Genomics uses via Unisat) works by:
1. Creating a virtual `to_spend` transaction that commits to the message
2. Creating a virtual `to_sign` transaction that spends the `to_spend` output
3. The signature is the witness data of the `to_sign` transaction

This is critical because **Bitmap inscriptions are typically held on Taproot addresses** (`bc1p...`), and legacy `signmessage` does not support Taproot.

---

## 2. Current Implementation Analysis

### 2.1 What the Code Does

**Unisat integration:**
```javascript
// verify/app.js — signChallenge()
async signChallenge(message) {
    if (this.wallet.provider === 'unisat') {
        const signature = await window.unisat.signMessage(message, 'bip322-simple');
        return { success: true, signature };
    }
```

**Xverse integration:**
```javascript
    } else if (this.wallet.provider === 'xverse') {
        const response = await window.sats.request('signMessage', {
            address: this.wallet.ordinalsAddress,
            message: message,
            protocol: 'BIP322',
        });
        if (response.status === 'success') {
            return { success: true, signature: response.result.signature };
        }
```

### 2.2 What the Code Does NOT Do

| Step | Required | Implemented | Status |
|------|----------|-------------|--------|
| Request BIP-322 signature from wallet | Yes | ✅ Yes | OK |
| Receive signature bytes | Yes | ✅ Yes | OK |
| **Verify signature against message** | Yes | ❌ No | **CRITICAL** |
| **Verify signer address matches Bitmap owner** | Yes | ❌ No | **CRITICAL** |
| **Verify signature format (simple vs. full)** | Yes | ❌ No | **HIGH** |
| Decode and validate witness data | Yes | ❌ No | **HIGH** |
| Handle signature encoding (base64) | Yes | ⚠️ Implicit | Wallet-dependent |
| Check signature against Taproot/SegWit address type | Yes | ❌ No | **HIGH** |

---

## 3. Findings

### BIP-01: Signature is Never Verified
**Severity:** Critical

The signature returned by the wallet is stored but never verified. This is the single most important gap.

**Per the BIP-322 spec**, verification requires:
1. Reconstruct the `to_spend` transaction from the message
2. Reconstruct the `to_sign` transaction template
3. Validate the witness/scriptSig from the signature against the `to_spend` output
4. Confirm the script corresponds to the claimed address

**Recommended library:** [`bip322-js`](https://github.com/AceCentre/bip322-js) or implement manually using `bitcoinjs-lib`:

```javascript
// Server-side verification example
const bitcoin = require('bitcoinjs-lib');
const { Verifier } = require('bip322-js');

function verifyBIP322(message, signature, address) {
    try {
        const isValid = Verifier.verifySignature(address, message, signature);
        return isValid;
    } catch (e) {
        console.error('BIP-322 verification failed:', e);
        return false;
    }
}
```

---

### BIP-02: No Address Type Detection
**Severity:** High

BIP-322 "simple" works differently for different address types:
- **P2WPKH** (`bc1q...`) — Witness contains `[signature, pubkey]`
- **P2TR** (`bc1p...`) — Witness contains `[signature]` (Schnorr signature, 64 bytes)
- **P2SH-P2WPKH** (`3...`) — Has additional redeemScript

The code doesn't detect the address type or handle these differences:

```javascript
this.wallet.address = address;  // Could be any type
// ... later ...
const signature = await window.unisat.signMessage(message, 'bip322-simple');
// No type-specific handling
```

**Impact:** Verification logic (when implemented) must branch based on address type. A Taproot signature verified as SegWit (or vice versa) will always fail.

**Fix:**
```javascript
function getAddressType(address) {
    if (address.startsWith('bc1p')) return 'p2tr';
    if (address.startsWith('bc1q')) return 'p2wpkh';
    if (address.startsWith('3'))    return 'p2sh-p2wpkh';
    if (address.startsWith('1'))    return 'p2pkh';
    throw new Error('Unsupported address type');
}
```

---

### BIP-03: Wallet Compatibility Differences
**Severity:** High

Each wallet implements BIP-322 slightly differently:

| Feature | Unisat | Xverse | Leather |
|---------|--------|--------|---------|
| BIP-322 simple | ✅ | ✅ | ⚠️ Partial |
| Taproot signing | ✅ | ✅ | ❌ (Stacks-focused) |
| Signature encoding | Base64 | Base64 | Varies |
| Protocol parameter | `'bip322-simple'` | `'BIP322'` | Unknown |
| Ordinals address type | Taproot (`bc1p`) | Taproot (`bc1p`) | SegWit (`bc1q`) or Taproot |

**Specific issues:**

1. **Unisat** uses the string `'bip322-simple'` as the type parameter — correct.
2. **Xverse** uses `'BIP322'` in the `protocol` field — the exact variant (simple vs. full) may depend on the address type. Need to confirm Xverse returns BIP-322 simple for Taproot addresses.
3. **Leather** is not yet implemented in the code. Leather historically focused on Stacks and may have limited or non-standard BIP-322 support. Their Ordinals support is newer and less tested.

**Fix:**
- Test signing + verification with each wallet independently
- Document the exact signature format each wallet returns
- Build wallet-specific verification paths if encodings differ
- Add a wallet compatibility test suite

---

### BIP-04: Signature Encoding Ambiguity
**Severity:** Medium

The BIP-322 specification doesn't mandate a specific encoding for the signature bytes. Different wallets may return:
- **Raw bytes** (Uint8Array)
- **Base64** (most common)
- **Hex string**

The code stores the signature as-is:
```javascript
return { success: true, signature: response.result.signature };
```

If one wallet returns Base64 and another returns hex, the verification logic will break unless it handles both.

**Fix:** Normalize all signatures to a consistent format (Base64 is the de facto standard):
```javascript
function normalizeSignature(sig) {
    if (typeof sig === 'string') {
        // Try base64
        try {
            const buf = Buffer.from(sig, 'base64');
            if (buf.toString('base64') === sig) return sig; // Valid base64
        } catch {}
        // Try hex
        if (/^[0-9a-f]+$/i.test(sig)) {
            return Buffer.from(sig, 'hex').toString('base64');
        }
    }
    if (sig instanceof Uint8Array) {
        return Buffer.from(sig).toString('base64');
    }
    throw new Error('Unknown signature format');
}
```

---

### BIP-05: Challenge Message Does Not Bind to Address
**Severity:** Medium

The challenge message includes block height, agent name, timestamp, and nonce — but not the expected signer address:

```javascript
const message = [
    'Block Genomics Agent Verification',
    '===================================',
    `Action: register_agent`,
    `Block: ${blockHeight}`,
    `Agent: ${agentName}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
    `Chain: bitcoin-mainnet`,
    '===================================',
    `Sign this message to verify you own Bitmap #${blockHeight}`,
].join('\n');
```

**Problem:** An attacker could take a legitimately signed challenge and claim it was signed by a different address (since the message doesn't specify who should sign it).

**Fix:** Include the expected signer address in the challenge:
```javascript
const message = [
    'Block Genomics Agent Verification',
    '===================================',
    `Action: register_agent`,
    `Block: ${blockHeight}`,
    `Agent: ${agentName}`,
    `Address: ${signerAddress}`,        // ← ADD THIS
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
    `Chain: bitcoin-mainnet`,
    '===================================',
    `Sign this message to verify you own Bitmap #${blockHeight}`,
].join('\n');
```

Then during verification: confirm the address in the message matches the address recovered from the signature AND matches the Bitmap owner.

---

### BIP-06: No Handling of "Full" BIP-322 Variant
**Severity:** Low

BIP-322 defines two variants:
1. **Simple** — Single-signer, most common
2. **Full** — Multi-sig, complex scripts

The code only requests "simple". This is correct for the current use case (single wallet signer), but should be documented as a limitation. If multisig wallets ever hold Bitmaps, the verification would fail.

**Fix:** Document that only BIP-322 simple is supported. If multisig support is needed in the future, implement the full variant.

---

### BIP-07: Taproot Schnorr Signature Specifics
**Severity:** Medium

Taproot addresses (`bc1p...`) use Schnorr signatures (BIP-340), which are 64 bytes. ECDSA signatures (used by SegWit/legacy) are 70-72 bytes (DER-encoded).

The verification logic must:
1. Detect the address type
2. Use the correct signature scheme (Schnorr for Taproot, ECDSA for others)
3. Use the correct public key derivation (x-only for Taproot, full for ECDSA)

**Since most Bitmap inscriptions are on Taproot addresses**, Schnorr verification is the primary path.

**Implementation guidance:**
```javascript
const { schnorr } = require('@noble/secp256k1');
// or use bitcoinjs-lib's Taproot support

function verifyTaprootSignature(message, signature, address) {
    // 1. Decode address to get x-only public key
    const { data: pubkeyXOnly } = bitcoin.address.fromBech32(address);
    
    // 2. Compute BIP-322 message hash
    const msgHash = computeBIP322MessageHash(message);
    
    // 3. Verify Schnorr signature
    return schnorr.verify(signature, msgHash, pubkeyXOnly);
}
```

---

### BIP-08: No Signature Expiry or Revocation
**Severity:** Low

A BIP-322 signature is valid forever — there's no expiry mechanism in the cryptographic scheme itself. Once signed, a message+signature pair can be replayed indefinitely.

**Current mitigation (design-level):** The nonce and timestamp in the challenge message make each signature unique. But without server-side nonce tracking, this is unenforced.

**Fix:** Server must:
1. Store each nonce and mark as used after verification
2. Reject challenges older than 5 minutes
3. Never accept the same signature twice

---

## 4. Wallet-Specific Edge Cases

### Unisat

| Issue | Description | Risk |
|-------|-------------|------|
| Network switching | Unisat supports mainnet, testnet, signet. If user is on testnet, signature is still "valid" but against a testnet address. | Medium |
| Account switching | User can switch accounts within Unisat. The address may change between challenge generation and signing. | Medium |
| Inscription indexing | `getInscriptions()` may not return all inscriptions if the wallet's internal index is stale. | Low |

**Mitigation:**
```javascript
// Verify network before signing
const network = await window.unisat.getNetwork();
if (network !== 'mainnet' && network !== 'livenet') {
    throw new Error('Please switch to Bitcoin mainnet');
}

// Verify address hasn't changed
const currentAccounts = await window.unisat.getAccounts();
if (currentAccounts[0] !== this.wallet.address) {
    throw new Error('Wallet address changed — please reconnect');
}
```

### Xverse

| Issue | Description | Risk |
|-------|-------------|------|
| Dual address model | Xverse has separate ordinals and payment addresses. The ordinals address holds Bitmaps, but signing must use the ordinals address. | High if wrong address is used |
| Sats Connect version | Different versions of the sats-connect library have different API shapes. | Medium |
| Mobile vs. extension | Xverse mobile and extension may handle BIP-322 differently. | Medium |

**Mitigation:**
```javascript
// Always use ordinals address for Bitmap verification
const ordinalsAddress = response.result.addresses.find(a => a.purpose === 'ordinals');
// NEVER use the payment address for Bitmap ownership verification
```

### Leather

| Issue | Description | Risk |
|-------|-------------|------|
| Stacks-first design | Leather was originally "Hiro Wallet" for Stacks. Bitcoin signing may be secondary/incomplete. | High |
| BIP-322 support | May not support BIP-322 for all address types. Test thoroughly before enabling. | High |
| API differences | `window.btc` vs. `window.LeatherProvider` — different eras of their API. | Medium |

**Recommendation:** Do NOT enable Leather for production until BIP-322 Taproot signing is confirmed working and tested. The code currently has no `connectLeather()` implementation — this is probably wise until testing is complete.

---

## 5. Recommended Verification Architecture

```
┌─────────────┐   Challenge Request   ┌──────────────────────┐
│   Client     │ ───────────────────→  │   Server             │
│   (Browser)  │                       │                      │
│              │   ← Challenge         │   Generate:          │
│              │   { msg, id, exp }    │   - nonce (CSPRNG)   │
│              │                       │   - timestamp        │
│              │                       │   - store in Redis   │
│              │                       │     TTL=300s         │
│   Wallet     │                       │                      │
│   signs msg  │                       │                      │
│              │                       │                      │
│              │   Submit Verification │                      │
│              │ ───────────────────→  │   Verify:            │
│              │   { id, sig, addr }   │   1. Nonce valid?    │
│              │                       │   2. Not expired?    │
│              │                       │   3. Not used?       │
│              │                       │   4. BIP-322 sig     │
│              │                       │      valid for addr? │
│              │                       │   5. addr owns       │
│              │                       │      bitmap #N?      │
│              │   ← Result            │   6. Generate genome │
│              │   { jwt, agent }      │   7. Store agent     │
│              │                       │   8. Issue JWT       │
└─────────────┘                       └──────────────────────┘
```

### Server-Side Verification Stack (Recommended)

```javascript
// Dependencies
const { Verifier } = require('bip322-js');
// or
const bitcoin = require('bitcoinjs-lib');
const { ECPair } = require('ecpair');

// Verification function
async function verifyOwnership(challengeId, signature, address) {
    // 1. Retrieve challenge from Redis
    const challenge = await redis.get(`challenge:${challengeId}`);
    if (!challenge) throw new Error('Challenge expired or invalid');
    
    const { message, nonce, timestamp, blockHeight } = JSON.parse(challenge);
    
    // 2. Check expiration
    if (Date.now() - new Date(timestamp).getTime() > 5 * 60 * 1000) {
        throw new Error('Challenge expired');
    }
    
    // 3. Mark as used (atomic)
    const wasUsed = await redis.getdel(`challenge:${challengeId}`);
    if (!wasUsed) throw new Error('Challenge already used');
    
    // 4. Verify BIP-322 signature
    const sigValid = Verifier.verifySignature(address, message, signature);
    if (!sigValid) throw new Error('Invalid signature');
    
    // 5. Verify Bitmap ownership
    const bitmapOwner = await getBitmapOwner(blockHeight); // Query indexer
    if (bitmapOwner !== address) throw new Error('Address does not own this Bitmap');
    
    // 6. Generate genome (deterministic, server-side)
    const genome = await generateCanonicalGenome(blockHeight);
    
    // 7. Create/update agent
    const agent = await prisma.agent.upsert({
        where: { walletAddress_blockHeight: { walletAddress: address, blockHeight } },
        create: { /* ... */ },
        update: { /* ... */ },
    });
    
    // 8. Issue JWT
    const jwt = signJWT({ agentId: agent.id, tier: 1, blockHeight });
    
    return { agent, jwt };
}
```

---

## 6. Summary & Recommendations

### Must Do (Before Production)

1. **Implement server-side BIP-322 verification** using `bip322-js` or `bitcoinjs-lib`
2. **Handle both Schnorr (Taproot) and ECDSA (SegWit) signatures** — branch on address type
3. **Include signer address in challenge message** to prevent address substitution
4. **Server-side nonce management** — generate, store, expire, mark-as-used
5. **Verify Bitmap ownership** against an Ordinals indexer at verification time
6. **Test with each wallet** — Unisat, Xverse, and (when ready) Leather
7. **Network validation** — Ensure mainnet before signing

### Should Do (Before Scale)

8. **Normalize signature encoding** — Handle base64 and hex inputs
9. **Add address consistency check** — Detect if wallet switched accounts mid-flow
10. **Implement periodic re-verification** — Bitmap ownership can transfer
11. **Support BIP-322 "full" variant** for future multisig needs

### Nice to Have (Future)

12. **Zero-knowledge Bitmap ownership proof** — Prove ownership without revealing which block
13. **On-chain verification anchoring** — Commit verification proofs to Bitcoin
14. **Multi-indexer cross-verification** — Check Bitmap ownership against 2+ independent indexers

---

### Compliance with BIP-322 Specification

| Requirement | Status | Notes |
|-------------|--------|-------|
| Support P2WPKH signing | ⚠️ Wallet-dependent | Not verified server-side |
| Support P2TR signing | ⚠️ Wallet-dependent | Not verified server-side |
| Support P2SH-P2WPKH signing | ⚠️ Wallet-dependent | Not verified server-side |
| Message → to_spend tx construction | ❌ Not implemented | Must implement server-side |
| to_sign tx witness validation | ❌ Not implemented | Must implement server-side |
| Signature format (witness serialization) | ❌ Not validated | Accepting whatever wallet returns |
| "Simple" variant | ✅ Requested from wallets | Correct for single-signer |
| "Full" variant | ❌ Not supported | Not needed currently |

**Overall BIP-322 compliance: ~30%** — The wallets do the signing correctly, but Block Genomics never verifies. The "trust" is entirely in the wallet UI showing the correct message, which is insufficient for a security-critical identity system.

---

*End of BIP-322 Review*
