# Licensing

Block Genomics Nexus ships under **two licenses**, on purpose.

- **The protocol and everything you build against it is MIT.** Permissive, forever,
  no strings. Implement the spec, ship an SDK, embed the CLI, sell the product you
  built on top — that is the point.
- **The Nexus platform itself is BUSL 1.1.** Read it, fork it, self-host it, run it
  in production commercially. The single thing you may not do is turn *our* platform
  into a paid hosted service that competes with ours. In **2029-08-10** that
  restriction expires and the whole thing becomes Apache 2.0.

A protocol that only one company can implement is not a protocol. A platform that a
cloud provider can resell on day one does not survive long enough to become a
standard. The split is how we get both.

---

## What you can do, free, today

Under the **MIT** components — no restrictions at all:

- Implement the Nexus Protocol in any language, for any purpose, commercial or not.
- Build agents, wallets, clients, explorers, and integrations with the SDK, MCP
  server, and CLI.
- Fork, rebrand, embed, and redistribute those components in closed-source products.

Under the **BUSL** platform — production use is expressly granted:

- **Self-host Nexus**, for yourself, your company, or your customers' internal use.
- **Use it in production commercially** — inside your business, in your own product,
  behind your own paywall.
- **Fork it and modify it** for internal use, research, evaluation, or contribution.
- **Run a node, registry, or explorer** for your own use.
- **Offer it to third parties free of charge.**
- **Read every line of the source.** Nothing here is obfuscated or withheld.

## The one thing you cannot do

Take Nexus — or a substantial subset of it — and **offer it to third parties as a
paid hosted or embedded service that competes with Block Genomics' own hosted
offering.**

That is the entire restriction. It is the "AWS clause." If you are not reselling our
platform as a service, it does not apply to you.

Two clarifications written into the license itself:

- Hosting Nexus **for internal use within your organization** (including affiliates
  under common control) is explicitly **not** a competitive offering.
- If your product is not competitive when you first ship it, it does not *become*
  competitive later just because we add features to Nexus.

Need something outside these terms? Commercial licenses are available:
**bitmapholdings@gmail.com**

## The 3-year clock

Every version of the Licensed Work converts to the **Apache License, Version 2.0**
on its **Change Date: 2029-08-10** — or four years after that version was first
published, whichever comes first.

This is a one-way ratchet. The Change Date can only be brought *forward*, never
pushed back. Today's Nexus is guaranteed to be Apache 2.0 open source by 2029, no
matter what happens to Block Genomics.

---

## Component-by-component

### MIT — permissive, forever

| Path | Component | Published as |
|---|---|---|
| [`docs/protocol/NEXUS-PROTOCOL-v1.md`](docs/protocol/NEXUS-PROTOCOL-v1.md) | Nexus Protocol v1 specification | — |
| [`sdk/agent-connect/`](sdk/agent-connect) | TypeScript client SDK | [`block-genomics-connect`](https://www.npmjs.com/package/block-genomics-connect) |
| [`packages/bg-mcp/`](packages/bg-mcp) | MCP server for AI agents | [`block-genomics-mcp`](https://www.npmjs.com/package/block-genomics-mcp) |
| [`cli/`](cli) | Command-line interface | [`block-genomics`](https://www.npmjs.com/package/block-genomics) |
| [`packages/runebolt/`](packages/runebolt) | RuneBolt — Runes-over-Lightning bridge (wallet software, not a service) | — |
| [`examples/reference-agent/`](examples/reference-agent) | Reference agent example | — |

Each directory carries its own `LICENSE` file. `app/src/content/nexus-protocol-v1.md`
is a build-time mirror of the canonical spec and is MIT as well.

### BUSL 1.1 — source-available, Apache 2.0 on 2029-08-10

| Path | Component |
|---|---|
| [`app/`](app) | Nexus web application and public API (Next.js) |
| [`api/`](api) | Genome generation API |
| [`api-server/`](api-server) | BIP-322 verification API |
| [`explorer/`](explorer) | OG image and preview service |
| *(everything else)* | Any file in this repository not listed as MIT above |

The full terms are in [`LICENSE`](LICENSE).

---

## Quick answers

**Can I build a commercial product on Block Genomics?**
Yes. If you build it with the MIT SDK/CLI/MCP or against the protocol, you are
completely unrestricted. If you self-host the BUSL platform inside your product,
that is production use and it is granted.

**Can I self-host Nexus for my company?**
Yes, including commercially, including for your own customers' internal use.

**Can I launch "Nexus Cloud" and charge for it?**
No — not while the Change Date is in the future. Email us for a commercial license.

**Is BUSL an open source license?**
No, and we do not claim otherwise. It is *source-available* and becomes genuine open
source (Apache 2.0) on the Change Date. The protocol and all client tooling are OSI
open source (MIT) right now.

**I want to contribute.**
Please do — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Contributions are licensed under
the same terms as the component you are contributing to.
