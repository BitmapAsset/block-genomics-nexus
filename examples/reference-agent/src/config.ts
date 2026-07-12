// Configuration, read once from the environment and validated up front so the
// agent fails fast with a clear message instead of deep inside the run loop.

import type { AgentPermission } from 'block-genomics-connect';
import type { AddressType } from './signer.js';

export interface AgentConfig {
  apiBaseUrl: string;
  wif: string;
  addressType: AddressType;
  blockHeight: number;
  endpointUrl: string;
  tier: 1 | 2 | 3;
  permissions: AgentPermission[];
  heartbeatMs: number;
  pollMs: number;
  revokeOnExit: boolean;
  credsFile: string;
}

const VALID_PERMISSIONS: AgentPermission[] = [
  'READ_DMS', 'SEND_DMS', 'MANAGE_CONTENT', 'BUILD_DECORATE', 'HANDLE_OFFERS', 'FULL_AUTONOMY',
];
const VALID_ADDRESS_TYPES: AddressType[] = ['p2wpkh', 'p2tr', 'p2pkh'];

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}. Copy .env.example to .env and fill it in.`);
  return v;
}

export function loadConfig(): AgentConfig {
  const blockHeight = Number(required('BG_BLOCK_HEIGHT'));
  if (!Number.isInteger(blockHeight) || blockHeight < 0) {
    throw new Error(`BG_BLOCK_HEIGHT must be a non-negative integer, got "${process.env.BG_BLOCK_HEIGHT}"`);
  }

  const tier = Number(process.env.BG_TIER ?? '1');
  if (![1, 2, 3].includes(tier)) throw new Error(`BG_TIER must be 1, 2, or 3, got "${process.env.BG_TIER}"`);

  const addressType = (process.env.BG_ADDRESS_TYPE ?? 'p2wpkh') as AddressType;
  if (!VALID_ADDRESS_TYPES.includes(addressType)) {
    throw new Error(`BG_ADDRESS_TYPE must be one of ${VALID_ADDRESS_TYPES.join(', ')}`);
  }

  const permissions = (process.env.BG_PERMISSIONS ?? 'READ_DMS,SEND_DMS')
    .split(',').map((p) => p.trim()).filter(Boolean) as AgentPermission[];
  const badPerms = permissions.filter((p) => !VALID_PERMISSIONS.includes(p));
  if (badPerms.length) throw new Error(`Unknown BG_PERMISSIONS: ${badPerms.join(', ')}`);

  return {
    apiBaseUrl: process.env.BG_API_URL ?? 'https://blockgenomics.io',
    wif: required('BG_WALLET_WIF'),
    addressType,
    blockHeight,
    endpointUrl: required('BG_ENDPOINT_URL'),
    tier: tier as 1 | 2 | 3,
    permissions,
    heartbeatMs: Math.max(1, Number(process.env.BG_HEARTBEAT_SECONDS ?? '30')) * 1000,
    pollMs: Math.max(1, Number(process.env.BG_POLL_SECONDS ?? '5')) * 1000,
    revokeOnExit: (process.env.BG_REVOKE_ON_EXIT ?? 'true') !== 'false',
    credsFile: process.env.BG_CREDS_FILE ?? '.agent.creds.json',
  };
}
