/**
 * schema.org entities for blockgenomics.io. Every claim here must also be true
 * of the visible site or the repo README; FAQ answers mirror the /docs FAQ.
 */
const SITE = "https://blockgenomics.io";
const REPO = "https://github.com/BitmapAsset/block-genomics-nexus";

export const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "Block Genomics",
  alternateName: ["Block Genomics Nexus", "Nexus Protocol"],
  url: SITE,
  logo: `${SITE}/icons/icon-192x192.png`,
  description:
    "Block Genomics is an open protocol that gives AI agents a verifiable identity anchored to a Bitcoin block (a Bitmap), proven with a BIP-322 signature.",
  sameAs: [
    REPO,
    "https://github.com/BitmapAsset",
    "https://www.npmjs.com/package/block-genomics-mcp",
    "https://www.npmjs.com/package/block-genomics-connect",
    "https://x.com/BlockGenomics",
  ],
};

export const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: SITE,
  name: "Block Genomics",
  description: "Bitcoin-anchored identity for AI agents: verify a Bitmap, register a sovereign agent, connect over MCP, API, CLI or SDK.",
  inLanguage: "en",
  publisher: { "@id": `${SITE}/#organization` },
};

export const SOFTWARE = {
  "@type": "SoftwareApplication",
  "@id": `${SITE}/#software`,
  name: "Block Genomics Nexus Protocol",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  url: SITE,
  downloadUrl: "https://www.npmjs.com/package/block-genomics-mcp",
  codeRepository: REPO,
  description:
    "Open protocol, MCP server, CLI, SDK and HTTP API that let an AI agent prove it owns a Bitcoin block and act under that identity. Reads are open; writes are gated on a BIP-322 ownership signature.",
  publisher: { "@id": `${SITE}/#organization` },
};

export const LANDING_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [ORGANIZATION, WEBSITE, SOFTWARE],
};

export const DOCS_FAQ: { q: string; a: string }[] = [
  {
    q: "What is Block Genomics?",
    a: "Block Genomics is an open protocol (the Nexus Protocol) that gives an AI agent a verifiable identity anchored to a Bitcoin block. Ownership comes from the block's .bitmap inscription on Bitcoin, proven with a BIP-322 signature. There are no accounts or passwords.",
  },
  {
    q: "Is Block Genomics a genomics or biotech company?",
    a: "No. Block Genomics is a Bitcoin and AI-agent identity project. The name uses \"genomics\" as a metaphor: each Bitcoin block carries its own unique, verifiable DNA.",
  },
  {
    q: "What gives an AI agent an identity anchored to a Bitcoin block?",
    a: "The agent's owner holds the .bitmap inscription for a block. The owner signs a single-use challenge from the Nexus API with that wallet (BIP-322), and the protocol re-checks ownership on Bitcoin before every write. The agent then runs with its own bearer token and never holds the owner's key.",
  },
  {
    q: "What is a Bitmap?",
    a: "A Bitmap is a Bitcoin block inscribed as <height>.bitmap on Ordinals. Each Bitcoin block becomes a unit of digital land and identity that one wallet owns.",
  },
  {
    q: "How do I connect an AI agent over MCP?",
    a: "Run npx block-genomics-mcp for the local stdio server (35 tools; read tools need no key), or point an MCP client at the remote endpoint https://blockgenomics.io/mcp.",
  },
  {
    q: "How do I check who owns a Bitcoin block?",
    a: "Call GET https://blockgenomics.io/api/v1/ownership/verify?blockHeight=840000. Reading is public and needs no key.",
  },
  {
    q: "How does BIP-322 verification work here?",
    a: "The API issues a purpose-scoped, single-use challenge. The wallet that holds the block's .bitmap inscription signs it using BIP-322. The server verifies the signature and never stores or sees a private key.",
  },
  {
    q: "Is it open source?",
    a: "Yes. The protocol and SDK are MIT licensed and the platform is BUSL-1.1 (see LICENSING.md in github.com/BitmapAsset/block-genomics-nexus).",
  },
];

export const DOCS_FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: DOCS_FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};
