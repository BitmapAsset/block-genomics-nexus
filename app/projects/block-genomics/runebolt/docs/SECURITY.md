# RuneBolt Security Documentation

**By [Block Genomics](https://blockgenomics.io)**

## Security Model

RuneBolt operates as a bridge between Bitcoin on-chain assets (Runes and Bitmap inscriptions) and the Lightning Network. Security is critical because the system handles real Bitcoin-denominated value.

### Trust Assumptions

| Component | Trust Level | Notes |
|-----------|-------------|-------|
| Bitcoin blockchain | Trustless | Consensus-enforced via PoW |
| HTLC scripts | Trustless | Enforced by Bitcoin Script |
| Lightning Network | Trustless (per-hop) | HTLC-based routing |
| Bridge operator (custodial mode) | Trusted | Holds Runes inventory |
| Bridge operator (non-custodial mode) | Minimal trust | Only facilitates, never holds funds |
| ord/Unisat indexer | Trusted for data | Balance lookups — verify on-chain when possible |
| LND node | Trusted | Operator's own node |

### Security Guarantees

1. **Atomic swaps**: Either both sides complete or neither does. The SHA-256 preimage mechanism ensures atomicity.
2. **Timeout protection**: HTLC `OP_CHECKLOCKTIMEVERIFY` ensures users can always reclaim locked funds after the timeout period.
3. **No custodial risk in non-custodial mode**: The bridge never holds user funds; HTLCs are settled on-chain.
4. **Preimage revelation is the commit point**: Once the preimage is revealed (by paying the Lightning invoice), the on-chain claim becomes possible. This is the atomic commit point.

## Threat Model

### Attack Vectors and Mitigations

| Attack | Risk | Mitigation |
|--------|------|------------|
| **Bridge operator steals funds** (custodial) | High | Use non-custodial mode for large amounts; operator reputation via Block Genomics |
| **HTLC timeout too short** | Medium | Default 144 blocks (~24h); minimum enforced in config validation |
| **Preimage leaked before payment** | Critical | Preimage generated with `crypto.randomBytes(32)`; never logged; only exposed after swap completion |
| **SSRF via indexer URLs** | Medium | All user inputs validated against safe character regex before URL interpolation |
| **DoS via API flooding** | Medium | JSON body size limited to 100KB; WebSocket connection cap (200); subscription limits |
| **WebSocket message flooding** | Medium | Max payload 4KB per message; max 50 subscriptions per client |
| **Lightning invoice replay** | Low | Each swap uses a unique payment hash; duplicate detection in swap engine |
| **Man-in-the-middle (API)** | Medium | Use TLS in production; CORS configured; `x-powered-by` disabled |
| **Private key exposure** | Critical | Keys loaded from file paths only; never hardcoded; redacted from logs |
| **Macaroon/cert theft** | Critical | File permissions enforced by OS; paths from env vars; never logged |
| **SQL/Command injection** | N/A | No SQL database; no shell command execution; pure TypeScript logic |
| **XSS** | Low | API-only (no HTML); JSON responses with proper Content-Type |

### HTLC-Specific Threats

| Attack | Description | Mitigation |
|--------|-------------|------------|
| **Griefing attack** | Attacker creates swaps but never completes them, locking bridge liquidity | Timeouts auto-expire; expiry monitoring runs every 60s |
| **Fee sniping** | Attacker observes preimage on-chain and front-runs the claim | P2WSH script ensures only the designated pubkey can claim |
| **Timelock manipulation** | Setting a very short timelock to race the bridge | Minimum timelock enforced (configurable, default 144 blocks) |
| **Dust attack** | Sending sub-dust outputs | All outputs use 546-sat minimum (Bitcoin dust limit) |

## Input Validation

All external inputs are validated at the API boundary:

### REST API
- **Zod schemas** validate all POST request bodies with strict types, regex patterns, and length limits
- **Address fields**: max 200 characters, safe character regex
- **Rune names**: alphanumeric + `.` + `_` only, max 100 characters
- **Amounts**: numeric strings only, max 30 digits
- **Lightning invoices**: must start with `ln`, max 1500 characters
- **Transaction IDs**: must be exactly 64 hex characters
- **Inscription IDs**: must match `^[a-f0-9]{64}:\d+$`

### WebSocket
- Max message payload: 4KB
- Max concurrent connections: 200
- Max subscriptions per client: 50
- Only `subscribe`, `subscribe_all`, and `unsubscribe` actions accepted

### Indexer Queries
- All address and txid values validated against `^[a-zA-Z0-9_.\-:]+$` before URL interpolation
- Prevents path traversal and SSRF attacks

## Secret Management

### What is considered secret

| Secret | Storage | Logged? |
|--------|---------|---------|
| Bitcoin RPC password | Environment variable | Redacted |
| LND macaroon | File (path in env var) | Redacted |
| LND TLS certificate | File (path in env var) | Never |
| Bridge private key | File (path in env var) | Redacted |
| Unisat API key | Environment variable | Redacted |
| HTLC preimages | In-memory only | Redacted |
| Payment hashes | In-memory | Logged (public) |

### Key Management Best Practices

1. **Never hardcode secrets**: All sensitive values come from environment variables or file paths specified in env vars
2. **Use `.env` files for local development only**: Never commit `.env` to version control (covered by `.gitignore`)
3. **File permissions**: Macaroon and TLS cert files should be readable only by the RuneBolt process user (`chmod 600`)
4. **Rotate credentials**: Periodically rotate Bitcoin RPC passwords and LND macaroons
5. **Separate environments**: Use different credentials for regtest/testnet/mainnet
6. **Bridge private key**: Store in an encrypted keystore; never store raw private keys in plain files in production
7. **Docker secrets**: In production, use Docker secrets or a secrets manager (Vault, AWS Secrets Manager) instead of env vars

### Log Redaction

The logger automatically redacts the following fields from all log output:
- `preimage`, `privateKey`, `privkey`, `secret`
- `macaroon`, `apiKey`, `password`, `rpcPass`
- `authorization`, `req.headers.authorization`, `req.headers.cookie`

## Network Security

### Production Deployment Checklist

- [ ] TLS termination (nginx/caddy) in front of the RuneBolt API
- [ ] CORS origins restricted to your domain (not `*`)
- [ ] LND gRPC not exposed publicly (internal network only)
- [ ] Bitcoin RPC not exposed publicly
- [ ] Firewall rules: only expose ports 443 (HTTPS) and 9735 (Lightning P2P)
- [ ] Rate limiting at the reverse proxy level
- [ ] WebSocket connections require origin checking
- [ ] Docker containers run as non-root user
- [ ] Log output sent to a secure, centralized logging system
- [ ] Monitoring and alerting for failed swaps and unusual patterns

### CORS Configuration

- **Development**: `CORS_ORIGINS=*` (acceptable for local regtest)
- **Production**: `CORS_ORIGINS=https://blockgenomics.io,https://app.blockgenomics.io`
- Never use `*` in production

## Audit Checklist

### Code Security
- [x] No hardcoded secrets, API keys, or credentials
- [x] All secrets loaded from environment variables
- [x] Secret redaction in logger (preimage, macaroon, passwords, API keys)
- [x] Input validation on all API endpoints (Zod schemas with length/format limits)
- [x] Transaction IDs validated as 64-char hex
- [x] Inscription IDs validated as txid:vout format
- [x] Address inputs validated and length-limited
- [x] URL path segments sanitized before interpolation (SSRF prevention)
- [x] JSON body size limited (100KB)
- [x] WebSocket connection and subscription limits
- [x] WebSocket message size limited (4KB)
- [x] Error responses don't leak internal state (stack traces, server errors)
- [x] Server error details only logged internally, not returned to clients
- [x] `x-powered-by` header disabled
- [x] Preimage only exposed in API responses after swap completion

### Cryptographic Security
- [x] `crypto.randomBytes(32)` used for all preimage generation
- [x] SHA-256 for payment hashes (Bitcoin/Lightning standard)
- [x] P2WSH for HTLC addresses (SegWit v0)
- [x] ECDSA signatures via bitcoinjs-lib (secp256k1)
- [x] No custom cryptographic implementations

### HTLC Security
- [x] Default timelock: 144 blocks (~24 hours) — sufficient for claim + confirmation
- [x] Refund path uses `OP_CHECKLOCKTIMEVERIFY` (not relative `OP_CSV`)
- [x] Both claim and refund paths require a valid signature
- [x] Preimage verification via `OP_SHA256 + OP_EQUALVERIFY`
- [x] HTLC state tracked (locked/claimed/refunded) to prevent double-claims
- [x] Expired swaps automatically detected and marked

### Infrastructure Security
- [x] Docker containers run as non-root (`USER node`)
- [x] Multi-stage Docker build (no dev dependencies in production image)
- [x] `.gitignore` excludes `.env`, macaroons, TLS certs, private keys
- [x] No sensitive defaults in production config (bridge address, private key path)
- [x] Graceful shutdown on SIGINT/SIGTERM

## Responsible Disclosure

If you discover a security vulnerability in RuneBolt, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: **security@blockgenomics.io**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
4. We will acknowledge receipt within 48 hours
5. We will work with you to understand and fix the issue
6. We will credit you in the security advisory (unless you prefer anonymity)

### Scope

In-scope:
- RuneBolt API server
- HTLC/escrow logic
- Key management
- Input validation
- Authentication/authorization bypass

Out-of-scope:
- Vulnerabilities in LND, bitcoind, or the Bitcoin protocol itself
- Social engineering attacks
- Denial-of-service via network flooding (use rate limiting at infrastructure level)

---

*RuneBolt Security Documentation by [Block Genomics](https://blockgenomics.io) | GitHub: [gary-moto](https://github.com/gary-moto)*
