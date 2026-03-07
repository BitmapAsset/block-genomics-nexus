import { createLogger } from '../utils/logger';
import { InscriptionInfo, UtxoRef } from '../types';

const log = createLogger('BitmapDetector');

export class BitmapDetector {
  private readonly ordApiUrl: string;

  constructor(ordApiUrl: string) {
    this.ordApiUrl = ordApiUrl;
  }

  /**
   * Check if a UTXO contains a Bitmap inscription.
   */
  async detectBitmap(utxo: UtxoRef): Promise<InscriptionInfo | null> {
    try {
      const inscriptions = await this.getInscriptionsForUtxo(utxo);
      const bitmap = inscriptions.find(i => i.isBitmap);
      return bitmap || null;
    } catch (err) {
      log.error({ err, txid: utxo.txid, vout: utxo.vout }, 'Bitmap detection failed');
      return null;
    }
  }

  /**
   * Get all inscriptions in a UTXO.
   */
  async getInscriptionsForUtxo(utxo: UtxoRef): Promise<InscriptionInfo[]> {
    const url = `${this.ordApiUrl}/output/${utxo.txid}:${utxo.vout}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Ord API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      inscriptions?: string[];
    };

    if (!data.inscriptions || data.inscriptions.length === 0) return [];

    const results: InscriptionInfo[] = [];
    for (const inscriptionId of data.inscriptions) {
      const info = await this.getInscriptionInfo(inscriptionId);
      if (info) {
        info.utxo = utxo;
        results.push(info);
      }
    }

    return results;
  }

  /**
   * Get detailed info about an inscription.
   */
  async getInscriptionInfo(inscriptionId: string): Promise<InscriptionInfo | null> {
    const url = `${this.ordApiUrl}/inscription/${inscriptionId}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, any>;

    const isBitmap = this.isBitmapInscription(data);
    const bitmapNumber = isBitmap ? this.extractBitmapNumber(data) : undefined;

    return {
      inscriptionId,
      contentType: data.content_type || '',
      contentLength: data.content_length || 0,
      genesisHeight: data.genesis_height || 0,
      genesisFee: data.genesis_fee || 0,
      address: data.address || '',
      utxo: { txid: '', vout: 0, value: 0 },
      isBitmap,
      bitmapNumber,
    };
  }

  /**
   * Scan multiple UTXOs for bitmap inscriptions.
   */
  async scanForBitmaps(utxos: UtxoRef[]): Promise<InscriptionInfo[]> {
    log.info({ count: utxos.length }, 'Scanning UTXOs for bitmap inscriptions');
    const bitmaps: InscriptionInfo[] = [];

    for (const utxo of utxos) {
      const bitmap = await this.detectBitmap(utxo);
      if (bitmap) {
        bitmaps.push(bitmap);
      }
    }

    log.info({ found: bitmaps.length }, 'Bitmap scan complete');
    return bitmaps;
  }

  private isBitmapInscription(data: Record<string, any>): boolean {
    // Bitmap inscriptions have content type text/plain and content
    // matching the pattern "NNNN.bitmap"
    if (data.content_type !== 'text/plain;charset=utf-8' &&
        data.content_type !== 'text/plain') {
      return false;
    }
    // Check if the inscription content matches bitmap pattern
    const content = data.content || '';
    return /^\d+\.bitmap$/.test(content);
  }

  private extractBitmapNumber(data: Record<string, any>): number | undefined {
    const content = data.content || '';
    const match = content.match(/^(\d+)\.bitmap$/);
    return match ? parseInt(match[1]) : undefined;
  }
}
