import { NextRequest, NextResponse } from 'next/server';
import { renderBitmapThumbnail, TxInput } from '@/lib/bitmap-renderer';
import { prisma } from '@/lib/prisma';

function getEpoch(height: number): number {
  return Math.floor(height / 210000) + 1;
}

async function fetchBlockTxs(height: number): Promise<TxInput[]> {
  const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!hashRes.ok) throw new Error('Failed to fetch block hash');
  const hash = await hashRes.text();

  const blockRes = await fetch(`https://mempool.space/api/block/${hash}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!blockRes.ok) throw new Error('Failed to fetch block info');
  const block = await blockRes.json();

  const txsRes = await fetch(`https://mempool.space/api/block/${hash}/txs/0`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!txsRes.ok) throw new Error('Failed to fetch txs');
  const txsData = await txsRes.json();

  const realTxs: TxInput[] = txsData.map((tx: any, i: number) => ({
    vbytes: tx.weight ? Math.ceil(tx.weight / 4) : tx.size || 250,
  }));

  const totalTx = block.tx_count;
  if (realTxs.length < totalTx) {
    // Estimate remaining txs
    const fetchedWeight = txsData.reduce((s: number, tx: any) => s + (tx.weight || (tx.size || 250) * 4), 0);
    const remainingWeight = Math.max(0, (block.weight || block.size * 4) - fetchedWeight);
    const remaining = totalTx - realTxs.length;
    const avgWeight = remaining > 0 ? remainingWeight / remaining : 1000;

    // Use seeded pseudo-random variation based on height
    let seed = height;
    for (let i = 0; i < remaining; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const variation = 0.5 + (seed % 1000) / 1000; // 0.5–1.5x
      const w = Math.max(400, Math.round(avgWeight * variation));
      realTxs.push({ vbytes: Math.ceil(w / 4) });
    }
  }

  return realTxs;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ height: string }> }
) {
  const { height: heightStr } = await params;

  // Strip .png suffix if present
  const cleanHeight = heightStr.replace(/\.png$/i, '');
  const height = parseInt(cleanHeight, 10);
  if (isNaN(height) || height < 0) {
    return NextResponse.json({ error: 'Invalid block height' }, { status: 400 });
  }

  const epoch = getEpoch(height);

  // Check cache
  try {
    const cached = await prisma.blockThumbnail.findUnique({
      where: { blockHeight: height },
    });
    if (cached) {
      const maxAge = epoch <= 4 ? 31536000 : 86400;
      return new NextResponse(new Uint8Array(cached.imageData), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': `public, max-age=${maxAge}${epoch <= 4 ? ', immutable' : ''}`,
        },
      });
    }
  } catch {
    // DB unavailable — render on the fly
  }

  // Generate
  try {
    const txs = await fetchBlockTxs(height);
    const png = renderBitmapThumbnail(txs, 256);

    // Save to DB (fire and forget)
    prisma.blockThumbnail
      .create({
        data: {
          blockHeight: height,
          imageData: new Uint8Array(png),
          txCount: txs.length,
          epoch,
        },
      })
      .catch(() => {}); // don't block response

    const maxAge = epoch <= 4 ? 31536000 : 86400;
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${maxAge}${epoch <= 4 ? ', immutable' : ''}`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to render' }, { status: 500 });
  }
}
