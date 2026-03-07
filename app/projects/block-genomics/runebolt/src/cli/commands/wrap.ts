import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';
import { WrapRequest } from '../../types';

export const wrapCommand = new Command('wrap')
  .description('Wrap Runes into Taproot Assets for Lightning transport')
  .requiredOption('--rune <name>', 'Rune name')
  .requiredOption('--amount <amount>', 'Amount to wrap')
  .requiredOption('--utxo <txid:vout>', 'Source UTXO containing the Runes')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const bolt = new RuneBolt(config);

      process.stdout.write('Password: ');
      const stdin = process.stdin;
      stdin.resume();
      stdin.setEncoding('utf-8');
      const password = await new Promise<string>((resolve) => {
        stdin.once('data', (data: string) => { stdin.pause(); resolve(data.trim()); });
      });
      await bolt.unlock(password);
      await bolt.connect();

      const [txid, voutStr] = options.utxo.split(':');
      const pubkey = bolt.keyManager.getTaprootPubkey("m/86'/1'/0'/0/0");

      const request: WrapRequest = {
        runeId: { block: 0, tx: 0 },
        runeName: options.rune.toUpperCase(),
        amount: BigInt(options.amount),
        sourceUtxo: { txid, vout: parseInt(voutStr), value: 546 },
        destinationPubkey: pubkey,
      };

      console.log(`Wrapping ${options.amount} ${options.rune}...`);
      const result = await bolt.wrap(request);

      console.log(`Wrap initiated!`);
      console.log(`Operation ID: ${result.operationId}`);
      if (result.assetId) {
        console.log(`Asset ID: ${result.assetId}`);
      }

      bolt.lock();
      await bolt.disconnect();
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
