export type BlockInfo = {
  height: number;
  epoch: "gold" | "cyan" | "purple" | "green" | "emerald";
  claimed: boolean;
  owner?: string;
};

export function getMockBlockInfo(height: number): BlockInfo {
  const epochs = ["gold", "cyan", "purple", "green", "emerald"] as const;
  const epoch = epochs[height % epochs.length];
  const claimed = height % 3 !== 0;
  return {
    height,
    epoch,
    claimed,
    owner: claimed ? `bc1qowner${height}` : undefined,
  };
}

export function getMockBlockData(height: number): string {
  return `block:${height}:bitmap:mock-data:${new Date(1700000000000 + height * 1000).toISOString()}`;
}

export function searchBitmapHeights(): number[] {
  return Array.from({ length: 5 }, (_, i) => 840000 + i * 128);
}
