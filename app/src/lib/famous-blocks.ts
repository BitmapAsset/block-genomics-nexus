/** Blocks every bitcoiner recognises: the first thing Home and Explore show a visitor. */
export const FAMOUS_BLOCKS: { height: number; label: string; note: string }[] = [
  { height: 0, label: 'Genesis', note: 'The first block, January 2009' },
  { height: 170, label: 'First transaction', note: 'Satoshi to Hal Finney' },
  { height: 210000, label: 'First halving', note: '50 → 25 BTC reward' },
  { height: 420000, label: 'Second halving', note: '25 → 12.5 BTC' },
  { height: 630000, label: 'Third halving', note: '12.5 → 6.25 BTC' },
  { height: 840000, label: 'Fourth halving', note: '6.25 → 3.125 BTC' },
];
