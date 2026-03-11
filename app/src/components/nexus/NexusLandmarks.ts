export interface BlockLandmark {
  height: number;
  title: string;
  description: string;
  color: string;
}

export const LANDMARKS: BlockLandmark[] = [
  {
    height: 0,
    title: 'Genesis Block',
    description: 'The first block mined by Satoshi Nakamoto (Jan 3, 2009).',
    color: '#f7931a',
  },
  {
    height: 546,
    title: "Satoshi's Last Block",
    description: 'Last known block mined by Satoshi before disappearing.',
    color: '#a855f7',
  },
  {
    height: 57043,
    title: 'Pizza Transaction',
    description: '10,000 BTC spent on two pizzas (May 22, 2010).',
    color: '#66ccff',
  },
  {
    height: 210000,
    title: 'First Halving',
    description: 'Block reward dropped from 50 to 25 BTC (2012).',
    color: '#f7931a',
  },
  {
    height: 420000,
    title: 'Second Halving',
    description: 'Block reward dropped from 25 to 12.5 BTC (2016).',
    color: '#66ccff',
  },
  {
    height: 481824,
    title: 'SegWit Activation',
    description: 'Segregated Witness activated on Bitcoin mainnet (2017).',
    color: '#22c55e',
  },
  {
    height: 630000,
    title: 'Third Halving',
    description: 'Block reward dropped from 12.5 to 6.25 BTC (2020).',
    color: '#a855f7',
  },
  {
    height: 840000,
    title: 'Fourth Halving',
    description: 'Block reward dropped from 6.25 to 3.125 BTC (2024).',
    color: '#10b981',
  },
];

const LANDMARK_MAP = new Map(LANDMARKS.map((item) => [item.height, item]));

export function getLandmark(height: number): BlockLandmark | undefined {
  return LANDMARK_MAP.get(height);
}
