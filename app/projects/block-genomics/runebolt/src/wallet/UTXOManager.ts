import { createLogger } from '../utils/logger';
import { BitcoinNetwork, Utxo, UtxoRef, RuneBalance, RuneId } from '../types';

const log = createLogger('UTXOManager');

export class UTXOManager {
  private utxos: Map<string, Utxo> = new Map();
  private readonly rpcUrl: string;
  private readonly rpcUser: string;
  private readonly rpcPass: string;

  constructor(rpcUrl: string, rpcUser: string, rpcPass: string) {
    this.rpcUrl = rpcUrl;
    this.rpcUser = rpcUser;
    this.rpcPass = rpcPass;
  }

  private utxoKey(txid: string, vout: number): string {
    return `${txid}:${vout}`;
  }

  /**
   * Scan UTXOs for a list of addresses (user's derived addresses).
   */
  async scanAddresses(addresses: string[]): Promise<Utxo[]> {
    log.info({ count: addresses.length }, 'Scanning addresses for UTXOs');
    const allUtxos: Utxo[] = [];

    for (const address of addresses) {
      const result = await this.bitcoinRpc('listunspent', [1, 9999999, [address]]);
      for (const u of result) {
        const utxo: Utxo = {
          txid: u.txid,
          vout: u.vout,
          value: Math.round(u.amount * 1e8),
          scriptPubKey: u.scriptPubKey,
          confirmations: u.confirmations,
        };
        this.utxos.set(this.utxoKey(u.txid, u.vout), utxo);
        allUtxos.push(utxo);
      }
    }

    log.info({ total: allUtxos.length }, 'UTXO scan complete');
    return allUtxos;
  }

  /**
   * Attach rune balance info to a UTXO (from indexer data).
   */
  setRuneBalance(txid: string, vout: number, balance: RuneBalance): void {
    const key = this.utxoKey(txid, vout);
    const utxo = this.utxos.get(key);
    if (utxo) {
      utxo.runeBalance = balance;
    }
  }

  /**
   * Get all UTXOs.
   */
  getAll(): Utxo[] {
    return Array.from(this.utxos.values());
  }

  /**
   * Get UTXOs containing a specific rune.
   */
  getRuneUtxos(runeId: RuneId): Utxo[] {
    return this.getAll().filter(u =>
      u.runeBalance &&
      u.runeBalance.runeId.block === runeId.block &&
      u.runeBalance.runeId.tx === runeId.tx
    );
  }

  /**
   * Get plain Bitcoin UTXOs (no runes attached) for fee funding.
   */
  getBitcoinUtxos(): Utxo[] {
    return this.getAll().filter(u => !u.runeBalance);
  }

  /**
   * Select UTXOs to cover a target amount.
   */
  selectForAmount(utxos: Utxo[], targetSats: number): { selected: Utxo[]; totalValue: number } {
    const sorted = [...utxos].sort((a, b) => b.value - a.value);
    const selected: Utxo[] = [];
    let totalValue = 0;

    for (const utxo of sorted) {
      selected.push(utxo);
      totalValue += utxo.value;
      if (totalValue >= targetSats) break;
    }

    if (totalValue < targetSats) {
      throw new Error(`Insufficient funds: need ${targetSats} sats, have ${totalValue} sats`);
    }

    return { selected, totalValue };
  }

  /**
   * Mark a UTXO as spent (remove from tracking).
   */
  spend(txid: string, vout: number): void {
    this.utxos.delete(this.utxoKey(txid, vout));
  }

  /**
   * Add a new UTXO (e.g., from a received transaction).
   */
  add(utxo: Utxo): void {
    this.utxos.set(this.utxoKey(utxo.txid, utxo.vout), utxo);
  }

  /**
   * Get total Bitcoin balance (excluding rune UTXOs).
   */
  getBitcoinBalance(): number {
    return this.getBitcoinUtxos().reduce((sum, u) => sum + u.value, 0);
  }

  /**
   * Get rune balances aggregated by rune name.
   */
  getRuneBalances(): Map<string, { runeId: RuneId; total: bigint }> {
    const balances = new Map<string, { runeId: RuneId; total: bigint }>();
    for (const utxo of this.getAll()) {
      if (utxo.runeBalance) {
        const name = utxo.runeBalance.runeName;
        const existing = balances.get(name);
        if (existing) {
          existing.total += utxo.runeBalance.amount;
        } else {
          balances.set(name, { runeId: utxo.runeBalance.runeId, total: utxo.runeBalance.amount });
        }
      }
    }
    return balances;
  }

  /**
   * Broadcast a signed transaction.
   */
  async broadcastTransaction(txHex: string): Promise<string> {
    log.info('Broadcasting transaction');
    const txid = await this.bitcoinRpc('sendrawtransaction', [txHex]);
    log.info({ txid }, 'Transaction broadcast');
    return txid;
  }

  /**
   * Get current block height.
   */
  async getBlockHeight(): Promise<number> {
    return this.bitcoinRpc('getblockcount', []);
  }

  /**
   * Get raw transaction hex.
   */
  async getRawTransaction(txid: string): Promise<string> {
    return this.bitcoinRpc('getrawtransaction', [txid, false]);
  }

  /**
   * Check if transaction is confirmed.
   */
  async isConfirmed(txid: string, required: number = 1): Promise<boolean> {
    try {
      const tx = await this.bitcoinRpc('getrawtransaction', [txid, true]);
      return (tx.confirmations || 0) >= required;
    } catch {
      return false;
    }
  }

  private async bitcoinRpc(method: string, params: unknown[]): Promise<any> {
    const body = JSON.stringify({ jsonrpc: '1.0', id: Date.now(), method, params });
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${this.rpcUser}:${this.rpcPass}`).toString('base64'),
      },
      body,
    });
    if (!res.ok) throw new Error(`Bitcoin RPC error: ${res.status}`);
    const data = (await res.json()) as { result: any; error: any };
    if (data.error) throw new Error(`Bitcoin RPC: ${data.error.message}`);
    return data.result;
  }
}
