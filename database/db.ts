/**
 * Block Genomics — Prisma Client Singleton
 *
 * Prevents multiple Prisma Client instances in development
 * (Next.js hot-reload creates new instances on every reload).
 *
 * Usage:
 *   import { db } from '@/database/db'
 *   const agents = await db.agent.findMany()
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// Re-export for convenience
export type { PrismaClient }
export default db
