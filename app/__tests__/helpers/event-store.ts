/**
 * An in-memory `BlockEvent` table with the two properties the emitter relies on
 * from Postgres, so the ordering logic can be exercised without a database:
 *
 *   - `@@unique([block, seq])`: a duplicate insert throws (P2002 shape);
 *   - `pg_advisory_xact_lock(ns, block)` via `$executeRaw` inside
 *     `$transaction(fn)`: a per-block mutex held until the callback settles.
 *
 * Every query yields to the event loop first, so concurrent transactions
 * genuinely interleave: without the lock, 50 concurrent emits all read the same
 * head. `lock: false` turns the mutex off (the negative control).
 *
 * The real-Postgres version of the concurrency test is
 * `__tests__/db/block-events-pg.test.ts` (runs when a test database is given).
 *
 * NOT collected by Jest (filename is not *.test.ts).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

const tick = () => new Promise<void>((r) => setImmediate(r));

export function createEventStore(opts: { lock?: boolean; missing?: boolean } = {}) {
  const rows: Row[] = [];
  const locks = new Map<number, Promise<void>>();
  const useLock = opts.lock !== false;
  let missing = !!opts.missing;

  const missingErr = () => Object.assign(new Error('The table `public.BlockEvent` does not exist in the current database.'), { code: 'P2021' });

  const model = {
    findFirst: async ({ where, orderBy }: any) => {
      await tick();
      if (missing) throw missingErr();
      const list = rows.filter(
        (r) =>
          r.block === where.block &&
          (where.kind === undefined || r.kind === where.kind) &&
          (where.ts?.gte === undefined || new Date(r.ts).getTime() >= new Date(where.ts.gte).getTime()),
      );
      // `orderBy` as Prisma takes it: one `{ field: dir }` or a list of them.
      const keys: Array<[string, string]> = (Array.isArray(orderBy) ? orderBy : [orderBy ?? { seq: 'asc' }]).map((o: any) => Object.entries(o)[0] as [string, string]);
      const val = (r: Row, k: string) => (k === 'ts' ? new Date(r.ts).getTime() : r[k]);
      list.sort((a, b) => {
        for (const [k, dir] of keys) {
          const d = val(a, k) - val(b, k);
          if (d !== 0) return dir === 'desc' ? -d : d;
        }
        return 0;
      });
      return list[0] ? { ...list[0] } : null;
    },
    findMany: async ({ where, orderBy, take }: any) => {
      await tick();
      if (missing) throw missingErr();
      let list = rows.filter(
        (r) =>
          r.block === where.block &&
          (where.seq?.gt === undefined || r.seq > where.seq.gt) &&
          (where.kind?.in === undefined || where.kind.in.includes(r.kind)),
      );
      if (orderBy?.id) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * (orderBy.id === 'desc' ? -1 : 1));
      else list.sort((a, b) => (orderBy?.seq === 'desc' ? b.seq - a.seq : a.seq - b.seq));
      if (take) list = list.slice(0, take);
      return list.map((r) => ({ ...r }));
    },
    findUnique: async ({ where }: any) => {
      await tick();
      if (missing) throw missingErr();
      const r = rows.find((x) => x.id === where.id);
      return r ? { ...r } : null;
    },
    create: async ({ data }: any) => {
      await tick();
      if (missing) throw missingErr();
      if (rows.some((r) => r.block === data.block && r.seq === data.seq)) {
        throw Object.assign(new Error('Unique constraint failed on the fields: (`block`,`seq`)'), { code: 'P2002' });
      }
      const row = { ...data };
      rows.push(row);
      return { ...row };
    },
  };

  const client: any = {
    blockEvent: model,
    rawCalls: [] as string[],
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      let release: (() => void) | null = null;
      const tx = {
        blockEvent: model,
        $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
          client.rawCalls.push(strings.join('?'));
          if (missing) throw missingErr();
          if (!useLock) return 1;
          const block = Number(values[1]);
          while (locks.has(block)) await locks.get(block);
          let done!: () => void;
          locks.set(block, new Promise<void>((r) => (done = r)));
          release = () => {
            locks.delete(block);
            done();
          };
          return 1;
        },
      };
      try {
        return await fn(tx);
      } finally {
        (release as (() => void) | null)?.();
      }
    },
    __rows: rows,
    __setMissing: (m: boolean) => {
      missing = m;
    },
  };
  return client;
}
