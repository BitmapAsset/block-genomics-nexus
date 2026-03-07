import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const blockHeight = parseInt(req.nextUrl.searchParams.get('blockHeight') || '0');
    const wallet = req.nextUrl.searchParams.get('wallet') || '';
    if (!blockHeight || !wallet) return NextResponse.json({ error: 'blockHeight and wallet required' }, { status: 400 });

    let state = await prisma.gameState.findUnique({
      where: { blockHeight_walletAddress: { blockHeight, walletAddress: wallet } },
    });

    if (!state) {
      state = await prisma.gameState.create({
        data: { blockHeight, walletAddress: wallet },
      });
    }

    return NextResponse.json({ state });
  } catch (err) {
    console.error('[GameState GET]', err);
    return NextResponse.json({ error: 'Failed to fetch game state' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blockHeight, walletAddress, ...updates } = body;

    if (!blockHeight || !walletAddress) {
      return NextResponse.json({ error: 'blockHeight and walletAddress required' }, { status: 400 });
    }

    const state = await prisma.gameState.upsert({
      where: { blockHeight_walletAddress: { blockHeight, walletAddress } },
      update: { ...updates, lastVisit: new Date() },
      create: { blockHeight, walletAddress, ...updates },
    });

    return NextResponse.json({ state });
  } catch (err) {
    console.error('[GameState POST]', err);
    return NextResponse.json({ error: 'Failed to update game state' }, { status: 500 });
  }
}
