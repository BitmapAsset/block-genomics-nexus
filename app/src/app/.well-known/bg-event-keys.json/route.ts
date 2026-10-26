/**
 * https://blockgenomics.io/.well-known/bg-event-keys.json
 *
 * The public half of the system key that signs `bg-event/1` system events and
 * attests every event hash (Living Block, spec §5.2). Derived at request time
 * from `BG_EVENT_SIGNING_KEY`; only the public key and its id are ever served.
 * With no key configured the list is empty and events read `signer.scheme:
 * "unsigned"`. A verifier fetches this once and pins it.
 *
 * Edge-cached for 5 minutes (+60 s stale-while-revalidate), not an hour: the
 * first fetch after `BG_EVENT_SIGNING_KEY` is set must not keep serving the
 * empty list for long. Still, set the key BEFORE anything fetches this file
 * (docs/RUNBOOK-CICD.md, "Turning on the Living Block event spine").
 */

import { publishedKeys } from '@/lib/block-event-core';
import { systemKey } from '@/lib/block-events';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(publishedKeys(systemKey()), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
