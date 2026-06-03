# SDK Security Notes

World builders act on behalf of Bitcoin block owners. Treat every write as a security-sensitive owner action.

## Trust Boundaries

- Bitcoin and Bitmap ownership are authority sources.
- Wallet signatures prove owner intent.
- Block Genomics verifies signatures and checks ownership before mutation.
- External clients must never forge, cache, or reuse owner signatures without consent.

## Signed Message Guidance

Every mutation message should include:

- Product name: Block Genomics
- Action: create-object, update-object, delete-object, or update-terrain
- Block height.
- Object id when applicable.
- Nonce.
- ISO timestamp.

Do not ask users to sign vague messages. A wallet prompt should make the action legible.

## Replay Protection

Clients should generate a fresh nonce for each signed action and should submit the action promptly. Server-side nonce storage should be added before marketplace, delegation, or high-value write flows depend on these endpoints.

## Secret Handling

SDK clients should not contain server secrets. Public clients can call read endpoints directly. Write endpoints require wallet signatures, not embedded API keys.

Never request seed phrases, private keys, or raw wallet credentials. Wallet adapters should only expose public addresses and signing methods.

## Owner UX

Before requesting a signature, show:

- block height,
- action,
- target object id when applicable,
- exact object or terrain fields being changed.

The owner should understand exactly what authority they are granting.

## Production Readiness Checklist

- Add server-side nonce tracking for replay prevention.
- Add typed client validation around object and terrain payloads.
- Add rate limits on mutation endpoints.
- Add audit events for world writes.
- Keep delegation writes behind explicit protocol support.
