/**
 * Minimal in-memory Prisma stand-in for isolated simulation tests.
 *
 * Supports the subset of query methods the agent-doorway routes and
 * `processOwnershipTransfer` actually use: create / findUnique / findFirst /
 * findMany / update / updateMany / deleteMany / count, plus `$transaction`
 * (array and interactive-callback forms). No real database, no network.
 *
 * NOT collected by Jest (filename is not *.test.ts).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

function matchWhere(row: Row, where: any): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries<any>(where)) {
    if (key === 'OR') {
      if (!Array.isArray(cond) || !cond.some((c) => matchWhere(row, c))) return false;
      continue;
    }
    if (key === 'AND') {
      if (!Array.isArray(cond) || !cond.every((c) => matchWhere(row, c))) return false;
      continue;
    }
    const val = row[key];
    if (cond === null) {
      if (val !== null && val !== undefined) return false;
      continue;
    }
    if (cond instanceof Date) {
      if (!(val instanceof Date) || val.getTime() !== cond.getTime()) return false;
      continue;
    }
    if (typeof cond === 'object') {
      const opKeys = ['equals', 'not', 'in', 'gt', 'gte', 'lt', 'lte'];
      const hasOp = opKeys.some((k) => k in cond);
      if (!hasOp) {
        // Compound-unique selector, e.g. { blockHeight_txIndex: { blockHeight, txIndex } }
        // — the sub-fields are top-level row fields that must all match.
        for (const [sk, sv] of Object.entries<any>(cond)) {
          if (row[sk] !== sv) return false;
        }
        continue;
      }
      if ('equals' in cond && val !== cond.equals) return false;
      if ('not' in cond && val === cond.not) return false;
      if ('in' in cond && !cond.in.includes(val)) return false;
      if ('gt' in cond && !(val != null && val > cond.gt)) return false;
      if ('gte' in cond && !(val != null && val >= cond.gte)) return false;
      if ('lt' in cond && !(val != null && val < cond.lt)) return false;
      if ('lte' in cond && !(val != null && val <= cond.lte)) return false;
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
}

function sortRows(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const [field, dir] = Object.entries<any>(orderBy)[0];
  return rows.slice().sort((a, b) => {
    const av = a[field]; const bv = b[field];
    const cmp = av > bv ? 1 : av < bv ? -1 : 0;
    return dir === 'desc' ? -cmp : cmp;
  });
}

export function createMemoryPrisma() {
  const tables = new Map<string, Row[]>();
  let counter = 0;
  const rowsOf = (model: string): Row[] => {
    if (!tables.has(model)) tables.set(model, []);
    return tables.get(model)!;
  };

  const makeModel = (model: string) => ({
    create: async ({ data }: any) => {
      const row: Row = { ...data };
      if (row.id === undefined && data.height === undefined && data.walletAddress === undefined) {
        row.id = `mock_${model}_${++counter}`;
      } else if (row.id === undefined && (model === 'bitmapAgent' || model === 'experience')) {
        row.id = `mock_${model}_${++counter}`;
      }
      if (row.id === undefined && !('height' in data) && !('walletAddress' in data)) row.id = `mock_${model}_${++counter}`;
      if (!('createdAt' in row)) row.createdAt = new Date();
      if (model === 'bitmapAgent') {
        if (!('status' in row)) row.status = 'active';
        if (!('lastHeartbeat' in row)) row.lastHeartbeat = new Date();
      }
      if (model === 'ownershipTransfer' && !('detectedAt' in row)) row.detectedAt = new Date();
      if (model === 'challenge' && !('consumedAt' in row)) row.consumedAt = null;
      if (model === 'verifiedSession') {
        // Keyed by id like the real table — walletAddress is NOT unique, since one
        // wallet may hold several concurrent sessions.
        if (row.id === undefined) row.id = `mock_${model}_${++counter}`;
        if (!('revokedAt' in row)) row.revokedAt = null;
        if (!('verifiedBlocks' in row)) row.verifiedBlocks = [];
        if (!('requestCount' in row)) row.requestCount = 0;
      }
      rowsOf(model).push(row);
      return row;
    },
    findUnique: async ({ where }: any) => rowsOf(model).find((r) => matchWhere(r, where)) ?? null,
    findFirst: async ({ where, orderBy }: any) => {
      const res = sortRows(rowsOf(model).filter((r) => matchWhere(r, where)), orderBy);
      return res[0] ?? null;
    },
    findMany: async ({ where, orderBy, take, skip }: any = {}) => {
      let res = sortRows(rowsOf(model).filter((r) => matchWhere(r, where)), orderBy);
      if (skip) res = res.slice(skip);
      if (take) res = res.slice(0, take);
      return res;
    },
    update: async ({ where, data }: any) => {
      const row = rowsOf(model).find((r) => matchWhere(r, where));
      if (!row) throw new Error(`[memory-prisma] ${model}.update: no row for ${JSON.stringify(where)}`);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const r of rowsOf(model)) if (matchWhere(r, where)) { Object.assign(r, data); count++; }
      return { count };
    },
    deleteMany: async ({ where }: any = {}) => {
      const rows = rowsOf(model);
      let count = 0;
      for (let i = rows.length - 1; i >= 0; i--) if (matchWhere(rows[i], where)) { rows.splice(i, 1); count++; }
      return { count };
    },
    delete: async ({ where }: any) => {
      const rows = rowsOf(model);
      const idx = rows.findIndex((r) => matchWhere(r, where));
      if (idx === -1) throw new Error(`[memory-prisma] ${model}.delete: no row for ${JSON.stringify(where)}`);
      return rows.splice(idx, 1)[0];
    },
    count: async ({ where }: any = {}) => rowsOf(model).filter((r) => matchWhere(r, where)).length,
    upsert: async ({ where, create, update }: any) => {
      const existing = rowsOf(model).find((r) => matchWhere(r, where));
      if (existing) { Object.assign(existing, update); return existing; }
      const row: Row = { ...create };
      if (!('createdAt' in row)) row.createdAt = new Date();
      if (!('updatedAt' in row)) row.updatedAt = new Date();
      rowsOf(model).push(row);
      return row;
    },
  });

  const models = [
    'challenge', 'bitmapAgent', 'block', 'user', 'agentEvent', 'agentBrief', 'agentSession',
    'blockProfile', 'guardianAgent', 'guardianConversation', 'guardianEvent',
    'vPSLink', 'delegation', 'delegationListing', 'ownershipTransfer', 'handleHistory', 'parcel',
    'apiRateLimit', 'experience', 'contentFlag', 'contentVerdict', 'brainAction',
    'verifiedSession', 'blockObject', 'blockTerrain', 'activityLog', 'estate',
  ] as const;

  const client: any = {
    $transaction: async (arg: any) => {
      if (typeof arg === 'function') return arg(client);
      return Promise.all(arg);
    },
    __reset: () => { tables.clear(); counter = 0; },
    __rows: (model: string) => rowsOf(model),
  };
  for (const m of models) client[m] = makeModel(m);
  return client;
}
