// PRIVACY: Never log private keys, seed phrases, or raw IPs

import { type Prisma } from '@prisma/client';
import prisma from './prisma';

export async function logActivity(walletAddress: string, action: string, metadata?: Prisma.InputJsonValue): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { walletAddress, action, metadata: metadata || undefined }
    });
  } catch { /* never let logging break the app */ }
}

export async function logPageView(path: string, walletAddress?: string, sessionId?: string, referrer?: string): Promise<void> {
  try {
    await prisma.pageView.create({
      data: { path, walletAddress: walletAddress || null, sessionId: sessionId || null, referrer: referrer || null }
    });
  } catch { /* fire and forget */ }
}

export async function logProfileView(viewedHandle: string, viewerAddress?: string): Promise<void> {
  try {
    await prisma.profileView.create({
      data: { viewedHandle, viewerAddress: viewerAddress || null }
    });
  } catch { /* fire and forget */ }
}

export async function logSearch(query: string, resultsCount: number, walletAddress?: string): Promise<void> {
  try {
    await prisma.searchLog.create({
      data: { query, resultsCount, walletAddress: walletAddress || null }
    });
  } catch { /* fire and forget */ }
}
