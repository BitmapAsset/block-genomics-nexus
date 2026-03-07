#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { unlockCommand } from './commands/unlock';
import { balanceCommand } from './commands/balance';
import { sendCommand } from './commands/send';
import { receiveCommand } from './commands/receive';
import { wrapCommand } from './commands/wrap';
import { unwrapCommand } from './commands/unwrap';
import { channelsCommand } from './commands/channels';
import { peersCommand } from './commands/peers';

const program = new Command();

program
  .name('runebolt')
  .description('RuneBolt - Self-sovereign Runes-over-Lightning wallet using Taproot Assets')
  .version('1.0.0');

program.addCommand(initCommand);
program.addCommand(unlockCommand);
program.addCommand(balanceCommand);
program.addCommand(sendCommand);
program.addCommand(receiveCommand);
program.addCommand(wrapCommand);
program.addCommand(unwrapCommand);
program.addCommand(channelsCommand);
program.addCommand(peersCommand);

program.parse();
