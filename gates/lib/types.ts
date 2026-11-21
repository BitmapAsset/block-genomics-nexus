// Shared types of the promise checks.
import type { Client } from './http.ts';

export type Need = 'gateBlock';

export type ProbeResult = {
  status: 'pass' | 'fail' | 'not_run';
  reason: string;
  values: Record<string, unknown>;
};

export type Ctx = {
  heights: number[];
  gateBlock: number | null;
  http: Client;
  repoRoot: string;
};

export type Check = {
  id: string;
  promise: string;
  group: 'promise' | 'security';
  needs: Need[];
  notCovered?: string;
  probe(ctx: Ctx): Promise<ProbeResult>;
};

// The check could not read what it needs (a source did not answer, a budget ran out).
// It is reported as `not_run`, never as `fail`.
export class NotRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotRunError';
  }
}
