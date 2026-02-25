export type MarketListing = {
  type: "bitmap" | "parcel" | "rental";
  block: number;
  price: number;
  status: "available" | "leased" | "sold";
};

export function getMarketListings(type?: string): MarketListing[] {
  const listings: MarketListing[] = [
    { type: "bitmap", block: 840128, price: 210000, status: "available" },
    { type: "parcel", block: 840256, price: 95000, status: "available" },
    { type: "rental", block: 840512, price: 15000, status: "leased" },
  ];
  return type ? listings.filter((l) => l.type === type) : listings;
}

export function getPrice(height: number) {
  return 100000 + (height % 1000) * 25;
}

export function pingResource(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), 800);
  });
}
