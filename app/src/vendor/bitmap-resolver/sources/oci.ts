// The bitmap On-Chain Index (OCI), inscribed module
// 942b5886158d57fc70cb8fb7d9bd4d37aa95b8b145be1a351326336b087262dbi0, which LiveOCI
// uses for every height below 942,000. Its own first line:
//
//   "0-942k : unvalidated, not a source of truth! there are still discrepancies
//    in this data! always DYOR"
//
// So an OCI answer is a candidate. The resolver checks it against the reveal
// transaction and labels first-ness `method: "oci"`.
//
// The decode below is a port of the module's fillPage() / getBitmapSat() /
// getBitmapSatIndex(), quirks included, because matching the room's index means
// matching its bugs too:
//   - pages 2 and 3 are served without brackets; the module wraps them and keeps
//     slice(0, 99999) and slice(100000, 199999), dropping one entry of each half;
//   - other pages are JSON after removing literal "\n  " (backslash-n) or double
//     spaces;
//   - pages 9 and 10 are {deltaEncodedSats, satIndexMap};
//   - sats are rebuilt from deltas with parseInt, as the module does.
// An unfilled position decodes to 0, which this module treats as "no entry".

export const OCI_MODULE_ID = '942b5886158d57fc70cb8fb7d9bd4d37aa95b8b145be1a351326336b087262dbi0';

/** First height the OCI does not cover (LiveOCI's OLD_OCI_LIMIT). */
export const OCI_LIMIT = 942000;

/** The 11 pages, pinned (inscriptions are immutable). */
export const OCI_PAGES: readonly string[] = [
  '01bba6c58af39d7f199aa2bceeaaba1ba91b23d2663bc4ef079a4b5e442dbf74i0',
  'bb01dfa977a5cd0ee6e900f1d1f896b5ec4b1e3c7b18f09c952f25af6591809fi0',
  'bb02e94f3062facf6aa2e47eeed348d017fd31c97614170dddb58fc59da304efi0',
  'bb037ec98e6700e8415f95d1f5ca1fe1ba23a3f0c5cb7284d877e9ac418d0d32i0',
  'bb9438f4345f223c6f4f92adf6db12a82c45d1724019ecd7b6af4fcc3f5786cei0',
  'bb0542d4606a9e7eb4f31051e91f7696040db06ca1383dff98505618c34d7df7i0',
  'bb06a4dffba42b6b513ddee452b40a67688562be4a1345127e4d57269e6b2ab6i0',
  'bb076934c1c22007b315dd1dc0f8c4a2f9d52f348320cfbadc7c0bd99eaa5e18i0',
  'bb986a1208380ec7db8df55a01c88c73a581069a51b5a2eb2734b41ba10b65c2i0',
  'b907b51a239e3a37f29f8222fb274f828c6ebf7b93ce501a55b7171daaa75758i0',
  'b942b6477c7da9090edb9751429ba9c3ba01b39ab972fc888d481f528e3e03c3i0',
];

/**
 * satIndex exceptions below 840,000: bitmaps that are not the first inscription
 * on their sat. Data credited to @_lefrog in the module, copied verbatim
 * (entries at 840,000 and above are never read; pages 9 and 10 carry their own).
 */
export const SAT_INDICES: Readonly<Record<number, number>> = {
  92871: 1, 92970: 1, 123132: 1, 365518: 1, 700181: 1, 826151: 1, 827151: 1, 828151: 1, 828239: 1,
  828661: 1, 829151: 1, 830151: 1, 832104: 2, 832249: 2, 832252: 2, 832385: 4, 833067: 1, 833101: 3,
  833105: 4, 833109: 4, 833121: 8, 834030: 2, 834036: 2, 834051: 17, 834073: 4, 836151: 1, 837115: 2,
  837120: 2, 837151: 1, 837183: 3, 837188: 2, 838058: 5, 838068: 2, 838076: 2, 838096: 1, 838151: 1,
  838821: 1, 839151: 1, 839377: 1, 839378: 2, 839382: 2, 839397: 1, 840151: 1, 841151: 1, 842151: 1,
  845151: 1,
};

/** A decoded page: `sats[position]`, plus page 9/10's own satIndex map. */
export interface OciPage {
  page: number;
  pageId: string;
  sats: { readonly [position: number]: number };
  satIndexMap: Readonly<Record<string, number>> | null;
}

/** getBitmapSat's page choice. */
export function ociPageFor(n: number): number {
  assertCovered(n);
  if (n >= 840000 && n < 907000) return 9;
  if (n >= 907000 && n < 942000) return 10;
  return Math.floor(n / 100000);
}

/** getBitmapSat's position within the page. */
export function ociPosition(n: number): number {
  assertCovered(n);
  if (n >= 907000) return n - 907000;
  if (n >= 840000) return n - 840000;
  return n % 100000;
}

function assertCovered(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0 || n >= OCI_LIMIT) {
    throw new Error(`OCI covers 0 to ${OCI_LIMIT - 1}`);
  }
}

// parseInt exactly as the module calls it (no radix, on numbers or strings).
const pInt = (v: unknown): number => parseInt(String(v));

/** Port of fillPage(): decode a page's raw text. */
export function decodeOciPage(page: number, text: string): OciPage {
  if (!Number.isInteger(page) || page < 0 || page > 10) throw new Error('OCI page must be 0-10');
  const pageId = OCI_PAGES[page];

  if (page === 9 || page === 10) {
    const data = JSON.parse(text) as { deltaEncodedSats: unknown[]; satIndexMap: Record<string, number> };
    const fullSats: number[] = [];
    data.deltaEncodedSats.forEach((sat, i) => {
      if (i === 0) fullSats.push(pInt(sat));
      else fullSats.push(pInt(fullSats[i - 1]) + pInt(sat));
    });
    return { page, pageId, sats: fullSats, satIndexMap: data.satIndexMap ?? {} };
  }

  let data: unknown = text;
  if (page === 2 || page === 3) {
    // fix for inconsistent (page 2 & 3) formatting (the module's words)
    const flat = JSON.parse('[' + text + ']') as unknown[];
    data = [flat.slice(0, 99999), flat.slice(100000, 199999)];
  } else {
    try {
      data = JSON.parse((data as string).replaceAll('\\n  ', ''));
    } catch {
      // as in the module: fall through to the next repair
    }
    try {
      data = JSON.parse((data as string).replaceAll('  ', ''));
    } catch {
      // as in the module: `data` is already parsed, or both repairs failed
    }
  }
  if (!Array.isArray(data) || !Array.isArray(data[0]) || !Array.isArray(data[1])) {
    throw new Error(`OCI page ${page} did not decode`);
  }
  const [deltas, order] = data as [unknown[], unknown[]];

  const fullSats: number[] = [];
  deltas.forEach((sat, i) => {
    if (i === 0) fullSats.push(pInt(sat));
    else fullSats.push(pInt(fullSats[i - 1]) + pInt(sat));
  });
  const filled: number[] = new Array(100000).fill(0);
  order.forEach((index, i) => {
    filled[index as number] = fullSats[i];
  });
  return { page, pageId, sats: filled, satIndexMap: null };
}

/** The sat the OCI names for height n, or null when the page has no entry. */
export function ociSat(page: OciPage, n: number): number | null {
  if (page.page !== ociPageFor(n)) throw new Error(`height ${n} is not on OCI page ${page.page}`);
  const sat = page.sats[ociPosition(n)];
  return typeof sat === 'number' && Number.isSafeInteger(sat) && sat > 0 ? sat : null;
}

/** Port of getBitmapSatIndex(). `page` is required for n >= 840,000. */
export function ociSatIndex(n: number, page?: OciPage): number {
  assertCovered(n);
  if (n >= 840000) {
    if (!page || page.page !== ociPageFor(n)) throw new Error('satIndex above 840000 needs its page');
    return page.satIndexMap?.[String(n)] || 0;
  }
  return SAT_INDICES[n] || 0;
}

/**
 * sha256 of each page's /content bytes as served by ordinals.com on 2026-10-15
 * (pages 0, 2, 4-7, 9 and 10 by scripts/record-vectors.mjs; 1, 3 and 8 by a
 * one-off fetch, all decoded by this module). Inscription content never
 * changes, so a page with any other hash came from a source that is wrong
 * about it, and the resolver says so instead of decoding it.
 */
export const OCI_PAGE_SHA256: readonly string[] = [
  '09c2de69d75d3ea5d5946f93fea39f5b30cbff3c6d2a58ab0fcd0bfd15e3c384',
  '5463cc2707e0d41003e5ece74eaf5a44d622e309c2c85f6c834ffd26331bf454',
  '9fa60b483b1ad39b300d7468620fbba913eecc336762f5013fff008328510849',
  '96457fefddd2110e681eade29c83e2319ea0c5c5c39e4ed89d09678696dcb409',
  '0b46bea72c30390fa67a4c8a99918139f270fd6605c8ef8b39e711d7a76eed00',
  'adb6e75573958248e06e2d043e45d72885d73e0d109f2e342c96aac0274f3d29',
  'd694907e8a441724bfb2aff24d43bb0959557c5333e433775adeadbdd6897280',
  'da4cfec8e8951b192e80d5d652d8f2bdfb9577169a3a2cf2e3275bd34c482e1d',
  'ae85b63719c6fd875df1b95a759109a02ea572f0fa44bfaa608610a889d7c14c',
  'e7b694c24ac0fc3d9b42aa0a973f0621ffb137a436e8c4fb81b485201a3ffa8b',
  'a402e0e193adf79d53eee25eecae971b71abae45c9c04425b2a1c36294082fd1',
];
