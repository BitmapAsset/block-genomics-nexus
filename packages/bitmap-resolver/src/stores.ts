// Cache interfaces. The package ships in-memory stores; an app supplies durable
// ones (the Block Genomics app will back them with Postgres).
//
// What goes where (keys are namespaced strings, values are JSON-safe):
//   immutable  fact:<inscriptionId>        reveal facts, once >= 6 confirmations deep
//              scan:<blockHash>            candidates of one block (serves every n <= height)
//              blockhash:<height>          hash, once >= 6 confirmations deep
//              oci:<pageId>                decoded OCI page (pinned ids never change)
//              canon:<rule>:<height>       a final verdict
//   ttl        canon:<rule>:<height>       a non-final verdict (10 min)
//              holder:<inscriptionId>      display-tier holder (60 s); auth never reads it
//              tip                         ord tip (30 s)

export interface ImmutableStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface TtlStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
}

export interface Stores {
  immutable: ImmutableStore;
  ttl: TtlStore;
}

export function memoryStores(now: () => number = () => Date.now()): Stores {
  const forever = new Map<string, unknown>();
  const expiring = new Map<string, { value: unknown; until: number }>();
  return {
    immutable: {
      async get(key) {
        return forever.get(key);
      },
      async set(key, value) {
        forever.set(key, value);
      },
    },
    ttl: {
      async get(key) {
        const hit = expiring.get(key);
        if (!hit) return undefined;
        if (now() >= hit.until) {
          expiring.delete(key);
          return undefined;
        }
        return hit.value;
      },
      async set(key, value, ttlMs) {
        expiring.set(key, { value, until: now() + ttlMs });
      },
    },
  };
}
