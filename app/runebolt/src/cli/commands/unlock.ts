import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const unlockCommand = new Command('unlock')
  .description('Unlock the wallet')
  .action(async () => {
    try {
      const config = loadConfig();
      const bolt = new RuneBolt(config);

      process.stdout.write('Enter wallet password: ');
      const stdin = process.stdin;
      stdin.resume();
      stdin.setEncoding('utf-8');

      const password = await new Promise<string>((resolve) => {
        stdin.once('data', (data: string) => {
          stdin.pause();
          resolve(data.trim());
        });
      });

      const info = await bolt.unlock(password);
      console.log(`Wallet unlocked. Fingerprint: ${info.fingerprint}`);
      console.log(`Network: ${info.network}`);
      console.log(`Addresses:`);
      for (const addr of info.addresses) {
        console.log(`  [${addr.index}] ${addr.address} (${addr.type})`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
