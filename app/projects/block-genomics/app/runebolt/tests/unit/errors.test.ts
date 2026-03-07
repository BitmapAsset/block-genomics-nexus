import {
  RuneBoltError,
  WalletError,
  WrapError,
  LightningError,
  TaprootAssetError,
  InsufficientFundsError,
  SecurityError,
} from '../../src/utils/errors';

describe('Error classes', () => {
  test('RuneBoltError has code and statusCode', () => {
    const err = new RuneBoltError('test', 'TEST_CODE', 418, { foo: 'bar' });
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(418);
    expect(err.details).toEqual({ foo: 'bar' });
    expect(err.name).toBe('RuneBoltError');
    expect(err instanceof Error).toBe(true);
  });

  test('WalletError defaults to 400', () => {
    const err = new WalletError('locked');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('WALLET_ERROR');
    expect(err.name).toBe('WalletError');
  });

  test('WrapError defaults to 400', () => {
    const err = new WrapError('failed');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('WRAP_ERROR');
  });

  test('LightningError defaults to 502', () => {
    const err = new LightningError('timeout');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('LIGHTNING_ERROR');
  });

  test('TaprootAssetError defaults to 500', () => {
    const err = new TaprootAssetError('mint failed');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TAPROOT_ASSET_ERROR');
  });

  test('InsufficientFundsError defaults to 400', () => {
    const err = new InsufficientFundsError('not enough');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INSUFFICIENT_FUNDS');
  });

  test('SecurityError defaults to 403', () => {
    const err = new SecurityError('denied');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('SECURITY_ERROR');
  });
});
