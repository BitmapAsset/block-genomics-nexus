import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const receiveCommand = new Command('receive')
  .description('Create a Lightning invoice to receive Taproot Asset payment')
  .requiredOption('--asset <assetId>', 'Taproot Asset ID')
  .requiredOption('--amount <amount>', 'Amount to receive')
  .option('--memo <memo>', 'Invoice memo', '')
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

      const invoice = await bolt.createInvoice(
        options.asset,
        BigInt(options.amount),
        options.memo,
      );

      console.log('\n=== Invoice Created ===');
      console.log(`Payment request: ${invoice.paymentRequest}`);
      console.log(`Payment hash: ${invoice.paymentHash}`);
      console.log(`Asset: ${invoice.assetId}`);
      console.log(`Amount: ${invoice.assetAmount}`);
      console.log(`Expires: ${new Date(invoice.createdAt.getTime() + invoice.expiry * 1000).toISOString()}`);

      bolt.lock();
      await bolt.disconnect();
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
