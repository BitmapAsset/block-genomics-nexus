# AI Business Agent — Premium Self-Hosted AI Assistant for Businesses

## Vision
A premium, self-hosted AI assistant that any business can run on their own machine or phone.
Think: **"Jarvis for your business"** — powered by OpenClaw-level capabilities.

Not a cloud SaaS where we hold their data. The agent runs ON THEIR HARDWARE.
Their data stays with them. Ultra-secure. Ultra-private.

## Core Principles
1. **Self-hosted first** — runs locally, no cloud dependency
2. **BYOK (Bring Your Own Key)** — works with any LLM provider
3. **Super secure** — data never leaves their machine unless they want it to
4. **Agent + Sub-agents** — spawn specialized agents for different tasks
5. **Voice-native** — talk to your business AI like talking to an employee
6. **Business-aware** — knows your products, customers, processes
7. **Multi-channel** — web chat, voice, WhatsApp, email, SMS

## Architecture

### Desktop App (Phase 1)
- **Electron + Next.js** — cross-platform (Mac, Windows, Linux)
- Local server runs on their machine
- Beautiful dashboard UI
- Tray icon — always running, always available
- One-click install: download, run, configure in 5 minutes

### Mobile App (Phase 2)
- React Native or PWA
- Connect to desktop agent remotely (secure tunnel)
- Or lightweight mobile-only mode

### How It Works
```
Business Owner installs app
    ↓
Setup Wizard:
  1. "What's your business?" (restaurant, salon, store, agency, etc.)
  2. "Upload your info" (menu, price list, FAQ, policies)
  3. "Add your API key" (OpenAI, Anthropic, etc.)
  4. "Add voice key" (ElevenLabs, OpenAI TTS — optional)
    ↓
Agent comes alive — knows your business
    ↓
Deploy to channels:
  - Embed chatbot on your website (script tag)
  - Connect WhatsApp Business
  - Phone number (voice agent)
  - Internal dashboard for owner
```

## Features (MVP)

### 🧠 Core Agent
- Natural language interface — ask anything about your business
- Context-aware — remembers conversations, learns preferences
- Knowledge base — ingests business docs, FAQs, product lists
- Action execution — can actually DO things (send emails, update records)

### 🤖 Sub-Agent Spawning
- **Receptionist Agent** — answers customer inquiries 24/7
- **Appointment Agent** — books, reschedules, reminds
- **Order Agent** — takes orders, processes payments
- **Support Agent** — handles complaints, returns, FAQ
- **Marketing Agent** — writes social posts, email campaigns
- **Analytics Agent** — reports on business metrics
- Owner can create CUSTOM agents for any task

### 🎙️ Voice
- BYOK voice: ElevenLabs, OpenAI TTS, Edge TTS (free fallback)
- Voice input: Whisper (local or API)
- Phone call handling (Twilio/Vonage integration — Phase 2)
- Choose your agent's voice and personality

### 🔌 Integrations (Phase 1)
- Website chatbot widget (embeddable)
- Email (IMAP/SMTP — reads and responds)
- Calendar (Google Calendar, Apple Calendar)
- WhatsApp Business API

### 🔌 Integrations (Phase 2)
- Stripe/Square (payments)
- Shopify/WooCommerce
- QuickBooks/Xero (accounting)
- Twilio (phone/SMS)
- Social media (Instagram, Facebook, X)

### 📊 Dashboard
- Conversation history — all customer interactions
- Analytics — response times, satisfaction, volume
- Agent performance — which sub-agents are busiest
- Knowledge base manager — add/edit/remove business info
- Settings — API keys, voice config, personality, channels

### 🔒 Security
- All data stored locally (SQLite or encrypted files)
- End-to-end encryption for remote access
- API keys stored in OS keychain (never plaintext)
- No telemetry unless opted in
- Audit log — see everything the agent did
- Owner approval required for sensitive actions

## Tech Stack
- **Frontend:** Next.js 15 + Tailwind CSS + shadcn/ui
- **Desktop wrapper:** Electron (cross-platform)
- **Local DB:** SQLite (via better-sqlite3 or Prisma + SQLite)
- **Vector DB:** Local (vectra or chromadb-local) for knowledge base
- **LLM:** OpenAI, Anthropic, Ollama (local), any OpenAI-compatible
- **Voice TTS:** ElevenLabs, OpenAI TTS, Edge TTS
- **Voice STT:** Whisper (local via whisper.cpp or API)
- **Agent framework:** Custom (inspired by OpenClaw architecture)
- **Packaging:** electron-builder (DMG for Mac, EXE for Windows, AppImage for Linux)

## LLM Strategy — "Instant Start" + BYOK

### Instant Start (Managed Mode)
- User clicks "Start Instantly" → uses OUR LLM via secure proxy
- App calls our proxy endpoint (api.bizagent.com/v1/chat)
- Proxy validates license → forwards to OpenAI → returns response
- Our API key NEVER ships in the app — only the proxy URL
- Business data stays on their machine, only chat messages transit the proxy (not stored)

### BYOK (Bring Your Own Key)
- Advanced users plug in their own OpenAI/Anthropic/Ollama key
- Direct to provider, no proxy, unlimited usage
- $9/month platform fee only

## Revenue Model
- **Trial** — FREE (50 messages/day, 1 agent, try before you buy)
- **Starter** — $29/month (500 messages/day, 3 agents, voice + widget)
- **Pro** — $79/month (2000 messages/day, 10 agents, all features, priority support)
- **Unlimited (BYOK)** — $9/month (bring your own key, unlimited everything)
- License validation via our proxy server
- Cost to us: ~$0.01-0.03/message on GPT-4o-mini = ~$4.50/month at Starter tier = $24.50 profit

## Name Ideas (TBD)
- BizAgent
- AgentForge
- HireAI
- BossAgent
- WorkMate AI
- CommandAI
- RunAgent

## Completely Separate From
- Block Genomics (different everything)
- PDF Genius (different product line)
- OpenClaw (inspired by, not affiliated with)

## MVP Scope (What to build FIRST)
1. ✅ Electron app that launches a local Next.js server
2. ✅ Setup wizard (business type, upload docs, API key)
3. ✅ Chat interface with the business agent
4. ✅ Knowledge base ingestion (PDF, TXT, CSV)
5. ✅ Sub-agent spawning (at least receptionist + support)
6. ✅ Embeddable website chatbot widget
7. ✅ Voice input/output (BYOK)
8. ✅ Dashboard (conversations, settings)
9. ✅ Beautiful, premium UI — this is a PAID product
