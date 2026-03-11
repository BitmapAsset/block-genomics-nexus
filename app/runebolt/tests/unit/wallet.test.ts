import { UTXOManager } from '../../src/wallet/UTXOManager';
import { SigningEngine } from '../../src/wallet/SigningEngine';
import { Utxo, RuneBalance, RuneId } from '../../src/types';

describe('UTXOManager', () => {
  let manager: UTXOManager;

  beforeEach(() => {
    manager = new UTXOManager('http://localhost:18443', 'bitcoin', 'bitcoin');
  });

  const mockUtxo = (txid: string, vout: number, value: number, rune?: RuneBalance): Utxo => ({
    txid,
    vout,
    value,
    scriptPubKey: '0014aabbccdd',
    confirmations: 6,
    runeBalance: rune,
  });

  test('add and getAll', () => {
    const utxo = mockUtxo('aa'.repeat(32), 0, 10000);
    manager.add(utxo);
    expect(manager.getAll()).toHaveLength(1);
    expect(manager.getAll()[0].txid).toBe('aa'.repeat(32));
  });

  test('spend removes UTXO', () => {
    const utxo = mockUtxo('bb'.repeat(32), 1, 5000);
    manager.add(utxo);
    expect(manager.getAll()).toHaveLength(1);
    manager.spend('bb'.repeat(32), 1);
    expect(manager.getAll()).toHaveLength(0);
  });

  test('getBitcoinUtxos excludes rune UTXOs', () => {
    const plainUtxo = mockUtxo('cc'.repeat(32), 0, 10000);
    const runeUtxo = mockUtxo('dd'.repeat(32), 0, 546, {
      runeId: { block: 840000, tx: 1 },
      runeName: 'TEST.RUNE',
      amount: 1000n,
      address: 'bc1qtest',
      utxo: { txid: 'dd'.repeat(32), vout: 0, value: 546 },
    });
    manager.add(plainUtxo);
    manager.add(runeUtxo);
    expect(manager.getBitcoinUtxos()).toHaveLength(1);
    expect(manager.getBitcoinUtxos()[0].txid).toBe('cc'.repeat(32));
  });

  test('getBitcoinBalance sums correctly', () => {
    manager.add(mockUtxo('11'.repeat(32), 0, 5000));
    manager.add(mockUtxo('22'.repeat(32), 0, 3000));
    expect(manager.getBitcoinBalance()).toBe(8000);
  });

  test('getRuneBalances aggregates by name', () => {
    const rune1: RuneBalance = {
      runeId: { block: 840000, tx: 1 },
      runeName: 'MY.RUNE',
      amount: 100n,
      address: 'bc1q1',
      utxo: { txid: '11'.repeat(32), vout: 0, value: 546 },
    };
    const rune2: RuneBalance = {
      runeId: { block: 840000, tx: 1 },
      runeName: 'MY.RUNE',
      amount: 200n,
      address: 'bc1q2',
      utxo: { txid: '22'.repeat(32), vout: 0, value: 546 },
    };
    manager.add(mockUtxo('11'.repeat(32), 0, 546, rune1));
    manager.add(mockUtxo('22'.repeat(32), 0, 546, rune2));

    const balances = manager.getRuneBalances();
    expect(balances.get('MY.RUNE')!.total).toBe(300n);
  });

  test('getRuneUtxos filters by runeId', () => {
    const targetRune: RuneBalance = {
      runeId: { block: 840000, tx: 1 },
      runeName: 'TARGET',
      amount: 50n,
      address: 'bc1q1',
      utxo: { txid: 'aa'.repeat(32), vout: 0, value: 546 },
    };
    const otherRune: RuneBalance = {
      runeId: { block: 840001, tx: 2 },
      runeName: 'OTHER',
      amount: 100n,
      address: 'bc1q2',
      utxo: { txid: 'bb'.repeat(32), vout: 0, value: 546 },
    };
    manager.add(mockUtxo('aa'.repeat(32), 0, 546, targetRune));
    manager.add(mockUtxo('bb'.repeat(32), 0, 546, otherRune));

    const found = manager.getRuneUtxos({ block: 840000, tx: 1 });
    expect(found).toHaveLength(1);
    expect(found[0].runeBalance!.runeName).toBe('TARGET');
  });

  test('selectForAmount selects sufficient UTXOs', () => {
    const utxos = [
      mockUtxo('11'.repeat(32), 0, 3000),
      mockUtxo('22'.repeat(32), 0, 5000),
      mockUtxo('33'.repeat(32), 0, 2000),
    ];
    const { selected, totalValue } = manager.selectForAmount(utxos, 7000);
    expect(totalValue).toBeGreaterThanOrEqual(7000);
    expect(selected.length).toBeGreaterThanOrEqual(2);
  });

  test('selectForAmount throws on insufficient funds', () => {
    const utxos = [mockUtxo('11'.repeat(32), 0, 1000)];
    expect(() => manager.selectForAmount(utxos, 5000)).toThrow('Insufficient funds');
  });

  test('setRuneBalance attaches rune info', () => {
    manager.add(mockUtxo('aa'.repeat(32), 0, 546));
    const balance: RuneBalance = {
      runeId: { block: 1, tx: 0 },
      runeName: 'TEST',
      amount: 42n,
      address: 'bc1q1',
      utxo: { txid: 'aa'.repeat(32), vout: 0, value: 546 },
    };
    manager.setRuneBalance('aa'.repeat(32), 0, balance);
    expect(manager.getAll()[0].runeBalance!.runeName).toBe('TEST');
  });
});

describe('SigningEngine', () => {
  test('estimateFee calculates correct vsize for taproot', () => {
    const engine = new SigningEngine(null as any, 'regtest');
    const fee = engine.estimateFee(1, 2, 10, true);
    // overhead(10.5) + 1*57.5 + 2*43 = 154, ceil = 154, * 10 = 1540
    expect(fee).toBe(1540);
  });

  test('estimateFee calculates correct vsize for segwit', () => {
    const engine = new SigningEngine(null as any, 'regtest');
    const fee = engine.estimateFee(2, 1, 5, false);
    // overhead(10.5) + 2*68 + 1*31 = 177.5, ceil = 178, * 5 = 890
    expect(fee).toBe(890);
  });
});
