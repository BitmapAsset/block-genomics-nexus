// `npm run keygen` — mint a throwaway mainnet keypair for local testing.
//
// This prints a private key. It is for EXPERIMENTS ONLY — never send Bitcoin to
// the printed address, and never register a real agent with a key you generated
// this way and left lying around.

import { generateWallet, type AddressType } from './signer.js';

const type = (process.argv[2] as AddressType) || 'p2wpkh';
const { wif, address } = generateWallet(type);

console.log(`\n  Throwaway ${type} wallet (testing only — do NOT fund):\n`);
console.log(`  Address : ${address}`);
console.log(`  WIF     : ${wif}\n`);
console.log('  Put the WIF in .env as BG_WALLET_WIF and the address type as BG_ADDRESS_TYPE.');
console.log('  Note: registering only succeeds if this address owns the block on-chain,');
console.log('  so a throwaway key will get a 403 at register — expected. See the README.\n');
