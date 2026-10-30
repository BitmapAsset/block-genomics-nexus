import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/site-card';

export const DOCS_ORIGIN = 'https://blockgenomics.io';

export type DocSlug =
  | 'quickstart-cli'
  | 'quickstart-sdk'
  | 'concepts'
  | 'api'
  | 'cli'
  | 'sdk'
  | 'faq'
  | 'what-is-a-bitmap'
  | 'bitcoin-mcp-server'
  | 'ai-agent-identity-bitcoin';

export type DocPageInfo = {
  slug: DocSlug;
  /** Short label for hub cards, Related links and prev/next. */
  label: string;
  /** `<title>`: at most 60 characters, with the category phrase. */
  title: string;
  /** Meta description: at most 160 characters. */
  description: string;
  /** One line shown under the label on the hub and in Related. */
  summary: string;
};

/** Reading order. Prev/next and Related are derived from this list. */
export const DOC_PAGES: readonly DocPageInfo[] = [
  {
    slug: 'quickstart-cli',
    label: 'CLI quickstart',
    title: 'Bitcoin Agent CLI Quickstart | Block Genomics Docs',
    description:
      'Prove you own a Bitcoin block with BIP-322, register an AI agent on it, and run it with heartbeat and a private event stream, all from the block-genomics CLI.',
    summary: 'Verify a block, register an agent and run it from the terminal.',
  },
  {
    slug: 'quickstart-sdk',
    label: 'SDK quickstart',
    title: 'AI Agent SDK Quickstart for Bitcoin | Block Genomics',
    description:
      'Register a sovereign AI agent on a Bitcoin block with block-genomics-connect, bring your own BIP-322 signer, then run heartbeat and a private event long-poll.',
    summary: 'Register and run a sovereign agent with the TypeScript SDK.',
  },
  {
    slug: 'concepts',
    label: 'Core concepts',
    title: 'Nexus Protocol Concepts: Bitcoin Agent Identity',
    description:
      'The four ideas behind Block Genomics: Bitcoin as source of truth, you bring the key, single-use challenges, and agent tokens kept apart from your wallet key.',
    summary: 'Bitcoin as source of truth, your own key, single-use challenges, agent tokens.',
  },
  {
    slug: 'api',
    label: 'API reference',
    title: 'Bitcoin Block Identity API Reference | Block Genomics',
    description:
      'Every Nexus Protocol endpoint with method, path and auth, plus runnable curl samples for the sandbox key, challenge, stats and agent runtime routes.',
    summary: 'Endpoints, auth levels and runnable curl samples.',
  },
  {
    slug: 'cli',
    label: 'CLI reference',
    title: 'block-genomics CLI Reference | Block Genomics Docs',
    description:
      'Every block-genomics command: verify, register-agent, events poll, heartbeat, token rotate and revoke, experience register and list, my-blocks and whoami.',
    summary: 'Every block-genomics command and what it does.',
  },
  {
    slug: 'sdk',
    label: 'SDK reference',
    title: 'block-genomics-connect SDK Reference | Block Genomics',
    description:
      'Methods of the block-genomics-connect TypeScript client: public reads, claimBlock, registerAgent, runtime heartbeat and events, token lifecycle and experiences.',
    summary: 'Every method of the TypeScript client.',
  },
  {
    slug: 'faq',
    label: 'FAQ',
    title: 'Block Genomics FAQ: Bitcoin AI Agent Identity',
    description:
      'Answers on Block Genomics: what it is, how an AI agent gets an identity anchored to a Bitcoin block, BIP-322 verification, MCP, Bitmaps and licensing.',
    summary: 'Short answers on identity, Bitmaps, MCP, BIP-322 and licensing.',
  },
  {
    slug: 'what-is-a-bitmap',
    label: 'What is a Bitmap?',
    title: 'What Is a Bitmap on Bitcoin? Ordinals Block Land',
    description:
      'A Bitmap is a Bitcoin block inscribed as <height>.bitmap on Ordinals. How ownership works, what the district holds, and how to check who owns a block.',
    summary: 'A Bitcoin block inscribed on Ordinals, owned by one wallet.',
  },
  {
    slug: 'bitcoin-mcp-server',
    label: 'Bitcoin MCP server',
    title: 'Bitcoin MCP Server for AI Agents | Block Genomics',
    description:
      'Connect any MCP client to Bitcoin block data: run npx block-genomics-mcp or use the remote endpoint. Read tools need no key; writes need proven ownership.',
    summary: 'Connect an MCP client to Bitcoin block data and agent identity.',
  },
  {
    slug: 'ai-agent-identity-bitcoin',
    label: 'AI agent identity on Bitcoin',
    title: 'AI Agent Identity on Bitcoin | Block Genomics',
    description:
      'How an AI agent gets a verifiable identity anchored to a Bitcoin block: ownership by .bitmap inscription, BIP-322 proof, a revocable token, no accounts.',
    summary: 'How an agent is tied to a Bitcoin block without accounts or passwords.',
  },
];

export function docPage(slug: DocSlug): DocPageInfo {
  const info = DOC_PAGES.find((p) => p.slug === slug);
  if (!info) throw new Error(`unknown docs page: ${slug}`);
  return info;
}

export function docUrl(slug: DocSlug): string {
  return `${DOCS_ORIGIN}/docs/${slug}`;
}

/** The `metadata` export of a docs page: own title, description, absolute canonical, share text. */
export function docMetadata(slug: DocSlug): Metadata {
  const { title, description } = docPage(slug);
  const url = docUrl(slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    ...shareMetadata({ title, description, path: url, type: 'article' }),
  };
}

/** Previous and next page in reading order; the ends link back to the hub. */
export function neighbours(slug: DocSlug): { prev: DocPageInfo | null; next: DocPageInfo | null } {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug);
  return { prev: i > 0 ? DOC_PAGES[i - 1] : null, next: i < DOC_PAGES.length - 1 ? DOC_PAGES[i + 1] : null };
}

/** The two pages a reader most likely wants next: the following two, wrapping at the end. */
export function siblings(slug: DocSlug): DocPageInfo[] {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug);
  return [DOC_PAGES[(i + 1) % DOC_PAGES.length], DOC_PAGES[(i + 2) % DOC_PAGES.length]];
}
