import pino from 'pino';

// Redact sensitive fields from log output
const REDACTED_PATHS = [
  'preimage',
  'privateKey',
  'privkey',
  'secret',
  'macaroon',
  'apiKey',
  'password',
  'rpcPass',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createLogger(module: string) {
  return logger.child({ module });
}
