import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const sendCommand = new Command('send')
  .description('Send a Taproot Asset payment over Lightning')
  .requiredOption('--asset <assetId>', 'Taproot Asset ID')
  .requiredOption('--invoice <invoice>', 'Lightning invoice to pay')
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

      console.log('Sending payment...');
      const payment = await bolt.sendAssetPayment(options.asset, options.invoice);

      console.log(`Payment ${payment.status}!`);
      console.log(`Payment hash: ${payment.paymentHash}`);
      console.log(`Fee: ${payment.feeSat} sats`);

      bolt.lock();
      await bolt.disconnect();
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
