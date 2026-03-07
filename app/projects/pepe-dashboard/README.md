# 🐸 Pepe Command Center

A beautiful monitoring dashboard for OpenClaw, built with React + Vite + Tailwind + Recharts.

## Features

- **Real-time Stats**: Total queries, token usage, estimated costs, response times
- **Token Usage Chart**: 24-hour breakdown of input/output tokens
- **Response Time Tracking**: Average and p95 latency visualization
- **Model Usage**: Pie chart showing distribution across Claude, GPT, Gemini
- **Tool Usage**: Bar chart with usage counts and trends
- **Session Monitor**: Active sessions with status and message counts
- **Cron Status**: Scheduled jobs and their next run times

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Tech Stack

- **Vite 7** + React 19 + TypeScript
- **Tailwind CSS v4** via @tailwindcss/vite
- **Recharts** for data visualization
- **Lucide React** for icons

## Design

- Dark theme with grid background
- Glowing accent colors (green, blue, purple, amber)
- Real-time clock and pulse indicator
- Responsive layout (mobile-friendly)

## Roadmap

- [ ] Connect to real OpenClaw API for live metrics
- [ ] WebSocket updates for real-time data
- [ ] Historical data persistence
- [ ] Cost breakdown by model
- [ ] Session drill-down views
- [ ] Alert configuration

---

*Built with ❤️ by Pepe for Gravity*
