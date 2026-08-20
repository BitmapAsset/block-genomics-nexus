import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { isValidHandle, normalizeHandle } from '@/lib/handle';
import AgentProfileClient from './agent-profile-client';

/**
 * Server gate in front of the (client-rendered) profile.
 *
 * The profile itself fetches over the API and, when nobody owns the handle,
 * renders a "No agent at @handle" panel. That panel used to be served with a
 * 200, so every mistyped or deleted handle looked to a crawler like a real,
 * indexable page. The existence check moved here so those answer 404.
 *
 * Rendered per request: whether a handle resolves is live state, and a cached
 * 404 would outlive someone registering that handle.
 */
export const dynamic = 'force-dynamic';

/** True when the handle definitely has no owner. Null when we could not tell. */
async function handleIsUnclaimed(handle: string): Promise<boolean | null> {
  try {
    const [profile, user] = await Promise.all([
      prisma.blockProfile.findUnique({ where: { handle }, select: { handle: true } }),
      prisma.user.findUnique({ where: { handle }, select: { handle: true } }),
    ]);
    return profile === null && user === null;
  } catch {
    // Database unreachable. Fail open — 404ing a real profile because of an
    // outage would drop it from search results for as long as the outage lasts.
    return null;
  }
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: raw } = await params;
  const handle = normalizeHandle(raw);

  // Shape failure needs no lookup — no such handle can ever be stored.
  if (!isValidHandle(handle)) notFound();

  if ((await handleIsUnclaimed(handle)) === true) notFound();

  return <AgentProfileClient />;
}
