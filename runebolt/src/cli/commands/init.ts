import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const initCommand = new Command('init')
  .description('Initialize a new RuneBolt wallet')
  .option('--import', 'Import from existing mnemonic')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const bolt = new RuneBolt(config);

      // Read password from stdin
      const password = await readPassword('Enter wallet password: ');
      const confirmPassword = await readPassword('Confirm password: ');

      if (password !== confirmPassword) {
        console.error('Passwords do not match');
        process.exit(1);
      }

      if (password.length < 8) {
        console.error('Password must be at least 8 characters');
        process.exit(1);
      }

      if (options.import) {
        const mnemonic = await readInput('Enter 24-word mnemonic: ');
        const result = await bolt.importWallet(mnemonic.trim(), password);
        console.log(`Wallet imported. Fingerprint: ${result.fingerprint}`);
      } else {
        const result = await bolt.initWallet(password);
        console.log('\n=== BACKUP YOUR MNEMONIC ===');
        console.log('Write these 24 words down and store them safely:');
        console.log(`\n  ${result.mnemonic}\n`);
        console.log('WARNING: This is the ONLY time your mnemonic will be shown.');
        console.log('If you lose it, you lose access to your funds forever.');
        console.log(`\nFingerprint: ${result.fingerprint}`);
      }

      bolt.lock();
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    let password = '';
    const onData = (ch: string) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007f') {
        password = password.slice(0, -1);
      } else {
        password += ch;
      }
    };
    stdin.on('data', onData);
  });
}

function readInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding('utf-8');
    stdin.once('data', (data: string) => {
      stdin.pause();
      resolve(data);
    });
  });
}
