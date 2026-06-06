import { getOwnership, getBlock, ApiError } from "./api";

export type BlockInfo = {
  height: number;
  claimed: boolean;
  ownerAddress: string | null;
  ownerHandle: string | null;
  tier: number | null;
  inscriptionId: string | null;
  onChainMatch: boolean;
};

// Real on-chain + DB block lookup. Combines ownership/verify (authoritative
// on-chain owner) with the block record (handle/tier/label) when present.
export async function getBlockInfo(height: number): Promise<BlockInfo> {
  const ownership = await getOwnership(height);
  let ownerHandle: string | null = null;
  let tier: number | null = null;
  let inscriptionId: string | null = ownership.inscriptionId;

  try {
    const block = await getBlock(height);
    ownerHandle = block.owner?.handle ?? null;
    tier = block.owner?.tier ?? null;
    inscriptionId = block.inscriptionId ?? inscriptionId;
  } catch (e) {
    // 404 = block not registered in our DB yet; on-chain data still valid.
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }

  const ownerAddress = ownership.onChainOwner || ownership.dbOwner;
  return {
    height,
    claimed: Boolean(ownerAddress),
    ownerAddress,
    ownerHandle,
    tier,
    inscriptionId,
    onChainMatch: ownership.match,
  };
}

// Illustrative-only palette for the terminal map grid. This is a visual layout
// hint derived from the height — NOT real claim status. Real ownership is
// fetched on selection. Kept deterministic so the grid is stable between renders.
const VISUAL_EPOCHS = ["gold", "cyan", "purple", "green", "emerald"] as const;
export type VisualEpoch = (typeof VISUAL_EPOCHS)[number];

export function visualEpoch(height: number): VisualEpoch {
  return VISUAL_EPOCHS[height % VISUAL_EPOCHS.length];
}
