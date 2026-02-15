import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { processReward, calculateLevel, checkAchievements } from '@/lib/game-logic';

export async function POST(req: NextRequest) {
  try {
    const { elementId, walletAddress, blockHeight } = await req.json();

    if (!elementId || !walletAddress || !blockHeight) {
      return NextResponse.json({ error: 'elementId, walletAddress, blockHeight required' }, { status: 400 });
    }

    // Fetch element
    const element = await prisma.gameElement.findUnique({ where: { id: elementId } });
    if (!element || !element.enabled) {
      return NextResponse.json({ error: 'Element not found or disabled' }, { status: 404 });
    }
    if (element.blockHeight !== blockHeight) {
      return NextResponse.json({ error: 'Block mismatch' }, { status: 400 });
    }

    // Check max claims
    if (element.maxClaims !== null && element.claimCount >= element.maxClaims) {
      return NextResponse.json({ error: 'Max claims reached' }, { status: 400 });
    }

    // Get or create game state
    let state = await prisma.gameState.findUnique({
      where: { blockHeight_walletAddress: { blockHeight, walletAddress } },
    });
    if (!state) {
      state = await prisma.gameState.create({ data: { blockHeight, walletAddress } });
    }

    // Check if already collected (one-time items)
    const collected: string[] = state.collected ? JSON.parse(state.collected) : [];
    if (!element.respawnMs && collected.includes(elementId)) {
      return NextResponse.json({ error: 'Already collected' }, { status: 400 });
    }

    // Process reward
    const reward = processReward(element);

    // Update collected list
    if (!collected.includes(elementId)) collected.push(elementId);

    // Update inventory
    const inventory: string[] = state.inventory ? JSON.parse(state.inventory) : [];
    if (reward.inventoryItem) inventory.push(reward.inventoryItem);

    // Calculate new values
    const newScore = state.score + reward.scoreAdd;
    const newCoins = state.coins + reward.coinsAdd;
    const newXp = state.xp + reward.xpAdd;
    const newLevel = calculateLevel(newXp);

    // Check achievements
    const stateForCheck = {
      score: newScore, xp: newXp, coins: newCoins,
      collected: JSON.stringify(collected),
      achievements: state.achievements,
      totalTimeMs: state.totalTimeMs,
    };
    const newAchievements = checkAchievements(stateForCheck);
    const allAchievements: string[] = state.achievements ? JSON.parse(state.achievements) : [];
    allAchievements.push(...newAchievements);

    // Update state
    const updatedState = await prisma.gameState.update({
      where: { id: state.id },
      data: {
        score: newScore,
        coins: newCoins,
        xp: newXp,
        level: newLevel,
        collected: JSON.stringify(collected),
        inventory: JSON.stringify(inventory),
        achievements: JSON.stringify(allAchievements),
        lastVisit: new Date(),
      },
    });

    // Update element claim count
    await prisma.gameElement.update({
      where: { id: elementId },
      data: { claimCount: { increment: 1 } },
    });

    // Update leaderboard
    await prisma.gameLeaderboard.upsert({
      where: { blockHeight_walletAddress_category: { blockHeight, walletAddress, category: 'score' } },
      update: { value: newScore },
      create: { blockHeight, walletAddress, category: 'score', value: newScore },
    });

    return NextResponse.json({
      success: true,
      reward: { type: reward.rewardType, amount: reward.rewardAmount },
      newState: updatedState,
      achievements: newAchievements,
    });
  } catch (err) {
    console.error('[Claim POST]', err);
    return NextResponse.json({ error: 'Failed to claim' }, { status: 500 });
  }
}
