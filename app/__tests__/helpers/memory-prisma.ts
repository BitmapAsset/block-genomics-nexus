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
      } else if (row.id === undefined && model === 'bitmapAgent') {
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
      rowsOf(model).push(row);
      return row;
    },
    findUnique: async ({ where }: any) => rowsOf(model).find((r) => matchWhere(r, where)) ?? null,
    findFirst: async ({ where, orderBy }: any) => {
      const res = sortRows(rowsOf(model).filter((r) => matchWhere(r, where)), orderBy);
      return res[0] ?? null;
    },
    findMany: async ({ where, orderBy, take }: any = {}) => {
      let res = sortRows(rowsOf(model).filter((r) => matchWhere(r, where)), orderBy);
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
    count: async ({ where }: any = {}) => rowsOf(model).filter((r) => matchWhere(r, where)).length,
  });

  const models = [
    'challenge', 'bitmapAgent', 'block', 'user', 'agentEvent', 'agentSession',
    'blockProfile', 'guardianAgent', 'guardianConversation', 'guardianEvent',
    'vPSLink', 'delegation', 'delegationListing', 'ownershipTransfer', 'handleHistory', 'parcel',
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
