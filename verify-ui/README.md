# Block Genomics — Verification UI

Mobile-first verification flow for Block Genomics. Users connect a Bitcoin wallet, select a Bitmap inscription, and experience a spectacular genome reveal.

## Quick Start

```bash
# Serve locally (any static server works)
cd verify-ui
python3 -m http.server 8080
# Open http://localhost:8080
```

No build step required — pure HTML/CSS/JS.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Single-page app shell with all 7 step containers |
| `verify.css` | Complete dark-theme stylesheet (mobile-first) |
| `verify.js` | Flow engine, wallet integration, animations |
| `README.md` | This file |

## The 7-Step Flow

### Step 0 — Welcome
Landing page with "Ready to claim your genome?" CTA and Demo Mode button.

### Step 1 — Wallet Connection
Three wallet cards: Unisat, Xverse, Leather. Auto-detects installed wallets. Shows install link for missing wallets. Connection animation with success state.

### Step 2 — Bitmap Selection
Grid of detected Bitmap inscriptions. Each card shows block height and inscription ID. Staggered entrance animation. Empty state with explanation and purchase links.

### Step 3 — Block Preview
Displays block data (height, hash, age, tx count). Animated trait badges appear with stagger. Mini DNA helix canvas preview. "Sign to Verify" CTA.

### Step 4 — Signing
Triple spinning ring animation. Instructional text. Clear cancellation path.

### Step 5 — THE REVEAL ✨
The hero moment — designed to be screen-recorded and shared:

1. **Flash** — Brief white flash signals the reveal start
2. **Particle Burst** — 60 colored particles explode from center with physics
3. **DNA Helix Build** — 3D double helix renders pair-by-pair on canvas. Each base pair fades in sequentially. Backbone lines connect nodes. Color-coded: A=red, T=green, G=blue, C=gold. 3D depth via z-based sizing and opacity. Continuous rotation animation.
4. **Glow Overlay** — Warm radial glow rises beneath the helix
5. **Trust Score Counter** — Ring fills with color-coded stroke. Number counts from 0 → final score with ease-out-expo easing
6. **Genome Hash Typewriter** — 64-char hex hash types out character by character with blinking cursor
7. **Trait Badges** — Spring-animated badges pop in one-by-one with rarity colors (legendary=gold, epic=red, rare=blue, common=grey)
8. **Identity Toggle** — "Human 🟢 / AI Agent 🔵" slides in
9. **Continue Button** — Appears last to let the moment breathe

### Step 6 — Profile
Complete profile card with:
- Genome-derived banner canvas
- Avatar with identity-colored ring (green=human, blue=AI)
- Stats grid (Trust / Traits / Block)
- Animated DNA viewer canvas
- Share on 𝕏, Copy Link, Download Badge
- Website embed code snippet
- Explore other verified blocks

## Demo Mode

Click "▶ Demo Mode" on the welcome screen to simulate the entire flow:
- Mock wallet: `bc1qxy2kgdygjrsq...`
- Mock bitmaps: Blocks #500000, #21000, #777777, #840000
- Mock signing (2.5s delay)
- Full reveal with sample genome data
- Trust Score: 87/100

## Technical Details

### Design
- **Theme:** Dark (#0a0a0f background)
- **Min width:** 375px (iPhone SE)
- **Touch targets:** ≥52px height for primary CTAs
- **Animations:** CSS transitions + requestAnimationFrame canvases
- **Fonts:** System font stack (SF Pro, Segoe UI, Roboto)

### Wallet Integration
Currently supports mock/demo mode. Real wallet integration hooks:
- `window.unisat.requestAccounts()` — Unisat connection
- `window.unisat.signMessage()` — Message signing
- Xverse and Leather stubs ready for implementation

### Canvas Animations
Three canvas elements render animated DNA:
1. **Mini DNA** (block preview) — Simple sine wave helix
2. **Reveal DNA** (the reveal) — Full 3D double helix with sequential build
3. **Profile DNA** (profile view) — Continuous horizontal helix

### Performance
- CSS `will-change` avoided (browser manages)
- Canvas uses `devicePixelRatio` for retina
- `requestAnimationFrame` for all canvas loops
- Backdrop filters used sparingly with fallbacks

## Customization

### Colors (CSS variables)
```css
--accent: #f7931a;     /* Bitcoin orange */
--dna-a: #ff4757;      /* Adenine red */
--dna-t: #2ed573;      /* Thymine green */
--dna-g: #1e90ff;      /* Guanine blue */
--dna-c: #ffa502;      /* Cytosine gold */
--human: #2ed573;      /* Human ring color */
--ai: #1e90ff;         /* AI agent ring color */
```

### Timing
Reveal sequence timing is in `runRevealSequence()` in verify.js. Adjust `await sleep(ms)` values to change pacing.

## Browser Support
- Chrome/Edge 90+
- Safari 15+
- Firefox 90+
- Mobile Safari (iOS 15+)
- Chrome for Android

## Next Steps
- [ ] Real wallet API integration (beyond Unisat)
- [ ] Bitmap inscription fetching from Ordinals API
- [ ] Server-side genome computation
- [ ] Badge image generation (canvas → PNG download)
- [ ] Sound effects for reveal sequence
- [ ] Shareable OG image generation
- [ ] Embed widget implementation
