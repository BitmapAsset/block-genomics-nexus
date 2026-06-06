// Worked example: a generic external agent connects to Block Genomics and reads
// its verified blocks end-to-end against the LIVE public API.
//
// Run (Node >=22, native TS strip):
//   node examples/connect-and-read.ts
//   node examples/connect-and-read.ts <bc1p-address> <blockHeight>
//
// What is real here:
//   - Every READ below hits https://blockgenomics.io live. No mocks.
// What is a preview (labelled DRY RUN):
//   - The world-write step builds the exact action-bound message + payload an
//     owner would sign and POST, but does NOT send it — that needs the agent's
//     own BIP-322 signer and the deployed Challenge table (Lane E migration).
//
// For OpenClaw / Hermes specifically: the only thing that changes is the signer.
// Implement BitcoinSigner over your wallet bridge (sign a string with the block's
// owning key) and pass it as { signer }. Everything else is identical.

import {
  BlockGenomicsClient,
  makeSigner,
  buildActionMessage,
  hashBody,
} from '../sdk/agent-connect/dist/index.js';

// A demo wallet that is a real, verified Tier-1 owner on the live protocol.
const DEMO_ADDRESS =
  process.argv[2] ?? 'bc1pw9agsvt5gsazsclr2nv90nc4swmy4jg7qvvsedh5tfpg7t62zfjqxeerue';
const DEMO_BLOCK = Number(process.argv[3] ?? 718222);

function log(title: string, value: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

async function main() {
  // 1. CONNECT — point at the live API (default is https://blockgenomics.io).
  //    A read-only signer lets us call "my blocks" helpers; signMessage throws
  //    because we never sign in the read path.
  const readOnlySigner = makeSigner(DEMO_ADDRESS, () => {
    throw new Error('read-only signer: signing is not wired in this example');
  });
  const client = new BlockGenomicsClient({ signer: readOnlySigner });
  console.log(`Connected to ${client.baseUrl} as ${DEMO_ADDRESS}`);

  // 2. DISCOVER — protocol-wide stats.
  log('Protocol stats (GET /api/v1/stats)', await client.getStats());

  // 3. READ A BLOCK — authoritative on-chain ownership + registered record + world.
  log(
    `On-chain ownership of block ${DEMO_BLOCK} (GET /api/v1/ownership/verify)`,
    await client.getOwnership(DEMO_BLOCK),
  );
  const block = await client.getBlock(DEMO_BLOCK);
  log(`Block ${DEMO_BLOCK} record (GET /api/v1/blocks/{height})`, {
    height: block.height,
    ownerHandle: block.owner?.handle,
    tier: block.owner?.tier,
    inscriptionId: block.inscriptionId,
    parcelCount: block.parcelCount,
  });
  log(`World of block ${DEMO_BLOCK} (GET /api/v1/world)`, await client.getWorld(DEMO_BLOCK));

  // 4. READ MY IDENTITY — genome + the blocks this wallet has verified.
  const identity = await client.getMyIdentity();
  log('My identity (GET /api/v1/users/by-wallet/{address})', {
    handle: identity.handle,
    genomeHash: identity.genomeHash,
    tier: identity.tier,
    verified: identity.verified,
    ownedBlocks: identity.ownedBlocks,
  });

  // 5. READ MY VERIFIED BLOCKS — enrich each owned block with its record.
  const myBlocks = await client.getMyVerifiedBlocks();
  log(
    'My verified blocks (enriched)',
    myBlocks.map((b) => ({
      height: b.height,
      handle: b.owner?.handle ?? null,
      tier: b.owner?.tier ?? null,
      parcelCount: b.parcelCount,
    })),
  );

  // 6. WRITE PREVIEW (DRY RUN) — what an owner-authorized world.create looks like.
  //    We fetch a REAL one-time 'world' nonce, then build the exact action-bound
  //    message + payload the agent would sign and POST. We do NOT send it: that
  //    needs a real BIP-322 signer and the deployed Challenge table.
  const intent = {
    blockHeight: DEMO_BLOCK,
    objectType: 'cube',
    color: '#f7931a',
    posX: 0,
    posY: 1,
    posZ: 0,
    ownerAddress: DEMO_ADDRESS,
  };
  const challenge = await client.requestChallenge(DEMO_ADDRESS, 'world');
  const bodyHash = await hashBody(intent);
  const message = buildActionMessage({
    action: 'world.create',
    method: 'POST',
    path: '/api/v1/world',
    blockHeight: DEMO_BLOCK,
    bodyHash,
    nonce: challenge.nonce,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  log('WRITE PREVIEW — canonical message to sign (DRY RUN, not sent)', message);
  log('WRITE PREVIEW — payload that would POST /api/v1/world (signature omitted)', {
    ...intent,
    message,
    signature: '<BIP-322 signature from YOUR signer goes here>',
  });
  console.log(
    '\nTo actually create the object: pass a real { signer } and call ' +
      'client.createObject(intent). Requires the deployed Challenge table (Lane E).',
  );

  console.log('\nDone. All reads above were live against', client.baseUrl);
}

main().catch((err) => {
  console.error('\nExample failed:', err);
  process.exit(1);
});
