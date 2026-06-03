# SDK Security Model

Block Genomics world writes are security-sensitive. A world builder is acting on behalf of a Bitcoin block owner.

## Trust Boundaries

- Bitcoin and Bitmap ownership are authority sources.
- Wallet signatures prove owner intent.
- Block Genomics verifies signatures and checks ownership before mutation.
- External clients must never forge, cache, or reuse owner signatures without consent.

## Signed Message Guidance

Every mutation message should include:

- Product name: `Block Genomics`
- Action: `create-object`, `update-object`, `delete-object`, or `update-terrain`
- Block height.
- Object id when applicable.
- Nonce.
- ISO timestamp.

Do not ask users to sign vague messages. A wallet prompt should make the action legible.

## Replay Protection

Client-generated nonces and timestamps should be included in every signed message. Server-side nonce tracking should be added before high-value marketplace or delegation operations depend on these endpoints.

## Secret Handling

SDK clients should not contain server secrets. Public clients can call read endpoints directly. Write endpoints require wallet signatures, not embedded API keys.

## Owner UX

World builders should surface the block height, action, and target object before asking for a signature. The owner should understand exactly what authority they are granting.

## Production Readiness Notes

- Add nonce storage for replay prevention.
- Add typed client validation around object and terrain payloads.
- Add rate limits on mutation endpoints.
- Add audit events for world writes.
- Keep delegation writes behind explicit protocol support.
