import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error } from '@/lib/api-helpers';
import { verifyStoredManifest } from '@/lib/experience-integrity';
import { computeManifestHash, WELL_KNOWN_MANIFEST_PATH } from '@/lib/experience-protocol';
import { fetchRemoteManifest, wellKnownManifestUrl } from '@/lib/experience-manifest-fetch';
import { enforceRateLimit, EXPERIENCE_VERIFY_LIMIT } from '@/lib/api-rate-limit';

/**
 * GET /api/v1/experiences/[id]/verify — public integrity check.
 *
 * Answers "is this registration still exactly what its owner signed?" without
 * asking anyone to trust us. The local half re-derives the canonical manifest
 * hash from the record's own fields and checks the stored BIP-322 signature
 * against it, so an altered manifest — including one altered by us — fails.
 *
 * `?remote=1` additionally fetches the manifest the host publishes at
 * /.well-known/nexus-experience.json and reports whether the live host agrees
 * with the registry. That fetch is the federation half: the registry holds the
 * deed-anchored claim, the host holds the running world, and this route says
 * whether the two still describe the same thing. It is SSRF-bounded on every
 * axis (see experience-manifest-fetch.ts) and rate-limited, because it is an
 * outbound request to an address a third party chose.
 *
 * A drift result is NOT an error: hosts legitimately lag. It is reported as
 * data so a client can decide.
 */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Canonical-hash an untrusted remote manifest document.
 *
 * Every field is read by name and type-checked. Returns null when the document
 * lacks the fields a manifest must have — an unparseable document is reported as
 * "does not match", never as a match by accident.
 */
async function safeRemoteHash(doc: Record<string, unknown>, fallbackBlockHeight: number): Promise<string | null> {
  const name = str(doc.name);
  const experienceType = str(doc.experienceType);
  const entryUrl = str(doc.entryUrl);
  const transport = str(doc.transport);
  const version = str(doc.version);
  if (!name || !experienceType || !entryUrl || !transport || !version) return null;

  const capabilities = Array.isArray(doc.capabilities)
    ? doc.capabilities.filter((c): c is string => typeof c === 'string')
    : undefined;

  try {
    return await computeManifestHash({
      manifestVersion: typeof doc.manifestVersion === 'number' ? doc.manifestVersion : undefined,
      blockHeight: typeof doc.blockHeight === 'number' ? doc.blockHeight : fallbackBlockHeight,
      parcelIndex: typeof doc.parcelIndex === 'number' ? doc.parcelIndex : undefined,
      name,
      description: str(doc.description),
      experienceType,
      entryUrl,
      transport,
      healthUrl: str(doc.healthUrl),
      clientRequirements: doc.clientRequirements,
      capabilities,
      contentRating: str(doc.contentRating),
      version,
      contentHash: str(doc.contentHash),
    });
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(req, { bucket: 'v1-experiences-verify', limit: EXPERIENCE_VERIFY_LIMIT });
  if (rl.response) return rl.response;

  try {
    const { id } = await params;
    const exp = await prisma.experience.findUnique({ where: { id } });
    if (!exp) return error('Experience not found', 404);

    const report = await verifyStoredManifest(exp);

    const wantRemote = new URL(req.url).searchParams.get('remote') === '1';
    let remote: Record<string, unknown> | null = null;

    if (wantRemote) {
      const manifestUrl = wellKnownManifestUrl(exp.entryUrl);
      if (!manifestUrl) {
        remote = { checked: true, reachable: false, reason: 'entry URL cannot host a well-known manifest' };
      } else {
        const fetched = await fetchRemoteManifest(manifestUrl);
        if (!fetched.ok) {
          remote = { checked: true, url: manifestUrl, reachable: false, reason: fetched.reason };
        } else {
          // Hash the remote document through the SAME canonicalizer, so "the
          // host publishes a different manifest" is decided by identical rules
          // on both sides rather than by a field-by-field eyeball. Fields are
          // read explicitly, never spread — the document is untrusted input and
          // must not be able to inject keys into the hashed object.
          const remoteHash = await safeRemoteHash(fetched.document, exp.blockHeight);
          remote = {
            checked: true,
            url: fetched.url,
            reachable: true,
            bytes: fetched.bytes,
            remoteManifestHash: remoteHash,
            matchesRegistry: remoteHash !== null && remoteHash === report.computedManifestHash,
            declaredBlockHeight: fetched.document.blockHeight ?? null,
            /** The host claiming a block it does not hold in the registry. */
            blockHeightMatches:
              fetched.document.blockHeight == null || fetched.document.blockHeight === exp.blockHeight,
          };
        }
      }
    }

    return success(
      {
        id: exp.id,
        blockHeight: exp.blockHeight,
        walletAddress: exp.walletAddress,
        manifestVersion: exp.manifestVersion,
        contentHash: exp.contentHash,
        wellKnownPath: WELL_KNOWN_MANIFEST_PATH,
        ...report,
        trustChain: {
          deed: 'Bitcoin bitmap inscription — ownership verified live at write time',
          signature: report.signed ? 'BIP-322, action-bound' : 'none (legacy challenge flow)',
          manifest: report.manifestHashMatches ? 'hash matches stored manifest' : 'hash mismatch',
        },
        remote,
      },
      200,
      rl.headers,
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return error(message, 500);
  }
}
