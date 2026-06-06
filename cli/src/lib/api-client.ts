// Thin compatibility layer over the real API client (./api.ts).
// Previously returned hardcoded data; now backed by live endpoints.

import { getListings, pingUrl, type Listing } from "./api";

export type MarketListing = {
  id: string;
  blockHeight: number;
  parcelTxIndex: number | null;
  tier: number;
  spotsTotal: number;
  spotsUsed: number;
  price30d: number;
  price365d: number;
  active: boolean;
  ownerHandle: string | null;
  label: string | null;
};

function toMarketListing(l: Listing): MarketListing {
  return {
    id: l.id,
    blockHeight: l.blockHeight,
    parcelTxIndex: l.parcelTxIndex,
    tier: l.tier,
    spotsTotal: l.spotsTotal,
    spotsUsed: l.spotsUsed,
    price30d: l.price30d,
    price365d: l.price365d,
    active: l.active,
    ownerHandle: l.owner?.handle ?? null,
    label: l.block?.label ?? null,
  };
}

// Real delegation/rental listings from the live marketplace.
export async function getMarketListings(opts: { blockHeight?: number; tier?: number } = {}): Promise<MarketListing[]> {
  const { listings } = await getListings({ limit: 100, ...opts });
  return listings.map(toMarketListing);
}

// Real reachability probe for external resources.
export function pingResource(url: string): Promise<boolean> {
  return pingUrl(url);
}
