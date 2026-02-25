import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-helpers';

/**
 * GET /api/v1/bitmap-image/:height
 * 
 * Returns the Magic Eden bitmap image URL for a given block height.
 * Looks up the .bitmap inscription ID via ordinals.com content search.
 * Caches results in memory.
 */

// In-memory cache: blockHeight → inscription ID
const inscriptionCache = new Map<number, string | null>();

// Known inscriptions (our blocks + well-known ones)
const KNOWN_INSCRIPTIONS: Record<number, string> = {
  718840: 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0',
  720143: '314c9f1602a18b54feecc0eca8e5724eea938b57f53df1921743dfb5b5152de5i0',
  738505: 'd5ba7c3282c250c0e8833483eced097660d4a9e940e770563968597e2df37605i0',
  745506: '6168ba458d997ec874135f6c1a5a70ae5e14844f745f7ab1b29377f2b47469d3i0',
  745966: '80ae7d3e42c4e57f96bbddb66794544736013fea9fed177ac104aaea378901d7i0',
  95238: '75abd6987e756f042e1ac5e714169e35f5086993bd176eac3156abc9e118291fi0', // nexus_brain
};

async function lookupBitmapInscription(height: number): Promise<string | null> {
  // Check known inscriptions first
  if (KNOWN_INSCRIPTIONS[height]) return KNOWN_INSCRIPTIONS[height];
  
  // Check cache
  if (inscriptionCache.has(height)) return inscriptionCache.get(height) ?? null;

  // Try to find via ordinals.com content search
  try {
    // Search for inscription with content "{height}.bitmap"
    const searchUrl = `https://ordinals.com/search/${height}.bitmap`;
    const res = await fetch(searchUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    
    // ordinals.com redirects to the inscription page if found
    const finalUrl = res.url;
    const match = finalUrl.match(/\/inscription\/([a-f0-9]{64}i\d+)/);
    if (match) {
      inscriptionCache.set(height, match[1]);
      return match[1];
    }

    // Try alternative: search in response body
    if (res.ok) {
      const text = await res.text();
      const bodyMatch = text.match(/([a-f0-9]{64}i\d+)/);
      if (bodyMatch) {
        inscriptionCache.set(height, bodyMatch[1]);
        return bodyMatch[1];
      }
    }
  } catch {
    // Lookup failed
  }

  inscriptionCache.set(height, null);
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  try {
    const { height } = await params;
    const h = parseInt(height, 10);
    if (isNaN(h) || h < 0 || h > 900000) {
      return error('Invalid block height', 400);
    }

    const inscriptionId = await lookupBitmapInscription(h);
    
    if (!inscriptionId) {
      return error('No .bitmap inscription found for this block', 404);
    }

    const imageUrl = `https://bitmap-img.magiceden.dev/v1/${inscriptionId}`;

    return success({
      height: h,
      inscriptionId,
      imageUrl,
      source: 'magiceden',
    });
  } catch (e: unknown) {
    return error(e instanceof Error ? e.message : 'Unknown error', 500);
  }
}
