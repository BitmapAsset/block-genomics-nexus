/**
 * Block Genomics Connection String
 * Format: bg://<guardianId>:<token>@<host>
 * 
 * One string to pair OpenClaw with a Guardian agent.
 * - guardianId: cuid of the GuardianAgent
 * - token: plaintext monitor token (shown once)
 * - host: API base (default: blockgenomics.io)
 */

const BG_PREFIX = 'bg://';

export interface ConnectionParts {
  guardianId: string;
  token: string;
  host: string;
}

export function encodeConnectionString(
  guardianId: string,
  token: string,
  host: string = 'blockgenomics.io'
): string {
  return `${BG_PREFIX}${guardianId}:${token}@${host}`;
}

export function decodeConnectionString(str: string): ConnectionParts | null {
  const s = str.trim();
  if (!s.startsWith(BG_PREFIX)) return null;

  const body = s.slice(BG_PREFIX.length);
  const atIdx = body.lastIndexOf('@');
  if (atIdx === -1) return null;

  const host = body.slice(atIdx + 1);
  const credPart = body.slice(0, atIdx);
  const colonIdx = credPart.indexOf(':');
  if (colonIdx === -1) return null;

  const guardianId = credPart.slice(0, colonIdx);
  const token = credPart.slice(colonIdx + 1);

  if (!guardianId || !token || !host) return null;

  return { guardianId, token, host };
}
