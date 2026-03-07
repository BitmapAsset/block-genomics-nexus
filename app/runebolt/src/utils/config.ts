import dotenv from 'dotenv';
import path from 'path';
import { RuneBoltConfig } from '../types';

dotenv.config();

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export function loadConfig(): RuneBoltConfig {
  const homeDir = process.env.HOME || '';
  const dataDir = env('RUNEBOLT_DATA_DIR', path.join(homeDir, '.runebolt'));

  return {
    network: env('BITCOIN_NETWORK', 'regtest') as RuneBoltConfig['network'],
    bitcoin: {
      rpcUrl: env('BITCOIN_RPC_URL', 'http://localhost:18443'),
      rpcUser: env('BITCOIN_RPC_USER', 'bitcoin'),
      rpcPass: env('BITCOIN_RPC_PASS', 'bitcoin'),
    },
    lnd: {
      host: env('LND_HOST', 'localhost'),
      port: parseInt(env('LND_PORT', '10009')),
      tlsCertPath: env('LND_TLS_CERT', path.join(homeDir, '.lnd/tls.cert')),
      macaroonPath: env('LND_MACAROON', path.join(homeDir, '.lnd/data/chain/bitcoin/regtest/admin.macaroon')),
    },
    tapd: {
      host: env('TAPD_HOST', 'localhost'),
      port: parseInt(env('TAPD_PORT', '10029')),
      tlsCertPath: env('TAPD_TLS_CERT', path.join(homeDir, '.tapd/tls.cert')),
      macaroonPath: env('TAPD_MACAROON', path.join(homeDir, '.tapd/data/regtest/admin.macaroon')),
    },
    indexer: {
      ordApiUrl: env('ORD_API_URL', 'http://localhost:80'),
    },
    wallet: {
      dataDir,
      walletFile: path.join(dataDir, 'wallet.enc'),
      auditLogFile: path.join(dataDir, 'audit.log'),
      unlockTimeoutMs: parseInt(env('WALLET_UNLOCK_TIMEOUT_MS', '600000')),
      maxUnlockAttempts: parseInt(env('WALLET_MAX_UNLOCK_ATTEMPTS', '5')),
      lockoutDurationMs: parseInt(env('WALLET_LOCKOUT_DURATION_MS', '300000')),
    },
    server: {
      port: parseInt(env('SERVER_PORT', '3000')),
      host: env('SERVER_HOST', '127.0.0.1'),
      corsOrigins: env('CORS_ORIGINS', 'http://localhost:3000').split(','),
    },
  };
}
