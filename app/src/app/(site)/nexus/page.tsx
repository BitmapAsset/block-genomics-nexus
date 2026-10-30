import type { Metadata } from "next";
import { parseBlockParam } from "@/lib/blockDeepLink";
import { isAboveTip } from "@/lib/block-summary";
import { epochDisplay } from "@/lib/bitmapStandard";
import { formatNumber } from "@/lib/genome-utils";
import { shareMetadata } from "@/lib/site-card";
import NexusPage from "./nexus-client";

const TITLE = "The Nexus: Bitcoin Block Map | Block Genomics";
const DESCRIPTION =
  "A map of every Bitcoin block, each one a 2.1km × 2.1km district of sovereign digital land. Search a block and walk inside it.";

/**
 * `/nexus?block=h` is the link people paste from the map's address bar, so it
 * unfurls as that block (title, text and its share card) rather than as the
 * homepage (QA 2026-10-22 #17). Reading the query makes this page render per
 * request; the page itself is a client shell, so that costs little.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const raw = (await searchParams).block;
  const height = parseBlockParam(typeof raw === "string" ? raw : undefined);

  if (height === undefined || (await isAboveTip(height))) {
    return {
      title: TITLE,
      description: DESCRIPTION,
      alternates: { canonical: "/nexus" },
      ...shareMetadata({ title: TITLE, description: DESCRIPTION, path: "/nexus" }),
    };
  }

  const title = `Block ${formatNumber(height)} in The Nexus — ${height}.bitmap | Block Genomics`;
  const description = `Walk inside Bitcoin block ${formatNumber(height)}: ${epochDisplay(height)}, a 2.1km × 2.1km district of sovereign digital land in The Nexus.`;
  return {
    title,
    description,
    // One indexable page per block; this view is the same block on the map.
    alternates: { canonical: `/block/${height}` },
    ...shareMetadata({
      title,
      description,
      path: `/nexus?block=${height}`,
      image: { url: `/og/block/${height}`, width: 1200, height: 630, alt: `Bitcoin block ${height} genome card` },
    }),
  };
}

export default function Page() {
  return <NexusPage />;
}
