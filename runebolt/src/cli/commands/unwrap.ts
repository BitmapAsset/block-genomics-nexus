import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const unwrapCommand = new Command('unwrap')
  .description('Unwrap Taproot Assets back to native Runes')
  .requiredOption('--asset <assetId>', 'Taproot Asset ID')
  .requiredOption('--amount <amount>', 'Amount to unwrap')
  .requiredOption('--destination <address>', 'Destination Bitcoin address')
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

      console.log(`Unwrapping ${options.amount} of asset ${options.asset}...`);
      const result = await bolt.unwrap({
        assetId: options.asset,
        amount: BigInt(options.amount),
        destinationAddress: options.destination,
        proof: {
          assetId: options.asset,
          proofFile: Buffer.alloc(0),
          anchorTx: '',
          merkleRoot: Buffer.alloc(0),
          verified: false,
        },
      });

      console.log(`Unwrap initiated!`);
      console.log(`Operation ID: ${result.operationId}`);

      bolt.lock();
      await bolt.disconnect();
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
