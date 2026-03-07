export class RuneBoltError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RuneBoltError';
  }
}

export class WalletError extends RuneBoltError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WALLET_ERROR', 400, details);
    this.name = 'WalletError';
  }
}

export class WrapError extends RuneBoltError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WRAP_ERROR', 400, details);
    this.name = 'WrapError';
  }
}

export class LightningError extends RuneBoltError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'LIGHTNING_ERROR', 502, details);
    this.name = 'LightningError';
  }
}

export class TaprootAssetError extends RuneBoltError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TAPROOT_ASSET_ERROR', 500, details);
    this.name = 'TaprootAssetError';
  }
}

export class InsufficientFundsError extends RuneBoltError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INSUFFICIENT_FUNDS', 400, details);
    this.name = 'InsufficientFundsError';
  }
}

export class SecurityError extends RuneBoltError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', 403, details);
    this.name = 'SecurityError';
  }
}
