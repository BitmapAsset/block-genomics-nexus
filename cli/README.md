# Block Genomics CLI

A premium command‑line experience for the Block Genomics protocol. Anchor identity to Bitcoin blocks via the Bitmap standard.

## Install

```bash
npm install
npm run build
```

## Run (dev)

```bash
npx tsx src/bin/bg.ts --help
npx tsx src/bin/bg.ts status
```

## Commands

- `bg init` — interactive setup wizard
- `bg verify [--block <height>] [--json]` — verify ownership
- `bg explore` — terminal Nexus map
- `bg build --block <height>` — deploy resources
- `bg connect --resource <url> [--block <height>]` — link resources
- `bg profile <create|show|edit|delete>` — manage profiles
- `bg wallet <balance|buy-bitmap|buy-parcel>` — wallet ops (mock)
- `bg market <list|rent|price>` — marketplace
- `bg agent <start|verify>` — agent mode
- `bg status` — current status

## Notes

MVP uses mock wallet + mock API responses. Config stored at `~/.block-genomics/config.json`.
