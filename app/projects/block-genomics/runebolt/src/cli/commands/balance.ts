import { Command } from 'commander';
import { RuneBolt } from '../../core/RuneBolt';
import { loadConfig } from '../../utils/config';

export const balanceCommand = new Command('balance')
  .description('Show wallet balances (BTC, Runes, Taproot Assets)')
  .action(async () => {
    try {
      const config = loadConfig();
      const bolt = new RuneBolt(config);

      // Wallet must be unlocked first
      process.stdout.write('Password: ');
      const stdin = process.stdin;
      stdin.resume();
      stdin.setEncoding('utf-8');
      const password = await new Promise<string>((resolve) => {
        stdin.once('data', (data: string) => { stdin.pause(); resolve(data.trim()); });
      });
      await bolt.unlock(password);
      await bolt.connect();

      const balances = await bolt.getBalances();

      console.log('\n=== RuneBolt Balances ===\n');
      console.log(`BTC: ${balances.btcSats} sats (${(balances.btcSats / 1e8).toFixed(8)} BTC)`);

      console.log('\nRunes:');
      if (balances.runes.size === 0) {
        console.log('  (none)');
      } else {
        for (const [name, info] of balances.runes) {
          console.log(`  ${name}: ${info.total} (${info.runeId.block}:${info.runeId.tx})`);
        }
      }

      console.log('\nTaproot Assets:');
      if (balances.taprootAssets.length === 0) {
        console.log('  (none)');
      } else {
        for (const asset of balances.taprootAssets) {
          console.log(`  ${asset.name}: ${asset.amount} (${asset.assetId.substring(0, 16)}...)`);
        }
      }

      console.log('\nChannels:');
      if (balances.channels.length === 0) {
        console.log('  (none)');
      } else {
        for (const ch of balances.channels) {
          console.log(`  ${ch.channelId}: local=${ch.localBalance} remote=${ch.remoteBalance} (${ch.active ? 'active' : 'inactive'})`);
        }
      }

      bolt.lock();
      await bolt.disconnect();
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
