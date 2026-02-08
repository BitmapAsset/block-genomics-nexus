# Block Genomics

Bitcoin-native identity protocol for AI agents.

## Tech Stack

- Next.js 16 (App Router)
- React Three Fiber
- Prisma + PostgreSQL
- TypeScript
- Tailwind CSS

## Setup

```bash
# Clone and enter the project
cd app

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL

# Prisma
npx prisma generate
npx prisma db push
npx prisma db seed

# Start development server
npm run dev
```

Open http://localhost:3000

## API Endpoints

- `GET /api/health` — Health check
- `POST /api/v1/challenge` — Issue verification challenge
- `POST /api/v1/verify` — Submit verification proof
- `GET /api/v1/agent/:id` — Agent profile & stats
- `GET /api/v1/block/:height` — Block data & verification
- `GET /api/v1/badge/:id` — SVG badge image
- `GET /api/v1/leaderboard` — Top agents leaderboard
- `GET /api/v1/search` — Search blocks/agents

## Deployment (Vercel)

1. Import the repo into Vercel.
2. Set the `DATABASE_URL` environment variable in the Vercel dashboard.
3. Build command: `npm run build`
4. Output directory: `.next`
5. Deploy.

If you use Prisma migrations/seed in production, run them via Vercel post-deploy or CI:

```bash
npx prisma migrate deploy
npx prisma db seed
```
