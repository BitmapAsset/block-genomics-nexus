import { describe, expect, it } from 'vitest';
import { checks } from '../checks/index.ts';

describe('the list of built checks', () => {
  it('exports the five checks in order', () => {
    expect(checks.map((c) => c.id)).toEqual(['G-MAP', 'G-DISTRICT', 'G-OWNER-ONLY', 'G-OPEN', 'G-SEC-CI']);
  });

  it('carries the exact promise of each check', () => {
    const promises = Object.fromEntries(checks.map((c) => [c.id, c.promise]));
    expect(promises).toEqual({
      'G-MAP': 'Every block is a map with one parcel per transaction.',
      'G-DISTRICT': 'Every block is a district of 2.1 km by 2.1 km.',
      'G-OWNER-ONLY': 'Only the owner of a block can build on it.',
      'G-OPEN': 'The SDK, the CLI and the MCP server are published as open packages.',
      'G-SEC-CI': 'The security scans are green on the commit that is live.',
    });
  });

  it('marks the groups, the parts not covered and the needs', () => {
    expect(checks.map((c) => c.group)).toEqual(['promise', 'promise', 'promise', 'promise', 'security']);
    expect(checks.filter((c) => c.notCovered).map((c) => c.id)).toEqual(['G-MAP', 'G-OWNER-ONLY']);
    for (const c of checks) {
      expect(c.needs).toEqual(c.id === 'G-OWNER-ONLY' ? ['gateBlock'] : []);
    }
  });
});
