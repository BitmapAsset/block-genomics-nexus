/**
 * Block 840000 seed-data cleanup (CLI). Not run by anyone yet: an operator
 * decides. What it changes and refuses: see cleanup-840000-core.ts.
 *
 *   BACKUP_DIR=<dir> npx tsx scripts/cleanup-840000.ts --dry-run          # default: backup + plan, no writes
 *   BACKUP_DIR=<dir> npx tsx scripts/cleanup-840000.ts --apply            # backup, then one guarded transaction
 *   BACKUP_DIR=<dir> npx tsx scripts/cleanup-840000.ts --restore <file>   # undo from a backup written above
 *
 * Every mode first writes a JSON backup of the rows involved to $BACKUP_DIR.
 * It is required and should live outside the repository: the backup holds
 * wallet addresses and must never be committed. Needs DATABASE_URL.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { applyCleanup, describePlan, refusals, restoreFromBackup, takeBackup, type Backup } from './cleanup-840000-core';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const restoreAt = args.indexOf('--restore');
  const restoreFile = restoreAt >= 0 ? args[restoreAt + 1] : null;
  if (apply && restoreFile) throw new Error('Pick one of --apply or --restore');
  if (restoreAt >= 0 && !restoreFile) throw new Error('--restore needs a backup file path');

  const dir = process.env.BACKUP_DIR;
  if (!dir) throw new Error('Set BACKUP_DIR to a directory outside the repository');

  const db = new PrismaClient();
  try {
    const backup = await takeBackup(db);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `840000-before-${backup.takenAt.replace(/[:.]/g, '')}.json`);
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`backup: ${file}`);

    if (restoreFile) {
      const saved = JSON.parse(readFileSync(restoreFile, 'utf8')) as Backup;
      await restoreFromBackup(db, saved);
      console.log(`restored from ${restoreFile}`);
      return;
    }

    for (const line of describePlan(backup)) console.log(`plan: ${line}`);
    const blocked = refusals(backup);
    for (const r of blocked) console.log(`refuse: ${r}`);

    if (!apply) {
      console.log('dry run: nothing written. Re-run with --apply to write.');
      return;
    }
    await applyCleanup(db, backup);
    console.log(`applied. Undo: BACKUP_DIR=${dir} npx tsx scripts/cleanup-840000.ts --restore ${file}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
