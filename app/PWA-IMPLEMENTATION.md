# Block Genomics — PWA Implementation

Progressive Web App implementation for the Block Genomics Bitcoin metaverse platform.

## Architecture

```
public/
├── manifest.json          # Web App Manifest
├── sw.js                  # Service Worker (vanilla, no framework)
├── icons/
│   ├── icon-192x192.png         # Standard icon
│   ├── icon-512x512.png         # Large icon
│   ├── icon-maskable-192x192.png # Maskable (Android adaptive)
│   ├── icon-maskable-512x512.png # Maskable large
│   ├── apple-touch-icon.png     # iOS home screen (180x180)
│   └── favicon-32x32.png        # Browser tab favicon

src/
├── app/offline/page.tsx          # Offline fallback page
├── lib/pwa-utils.ts              # Push, offline queue, install tracking
├── components/pwa/
│   ├── PWARegistration.tsx       # SW registration (renders nothing)
│   ├── InstallPrompt.tsx         # Smart install banner
│   ├── BottomTabBar.tsx          # Mobile bottom navigation
│   └── SplashScreen.tsx          # PWA launch splash

scripts/
└── generate-icons.js             # Icon generation (uses canvas package)
```

## Service Worker Strategy

| Route Pattern | Strategy | Cache Name | Notes |
|---|---|---|---|
| `/_next/static/*` | Cache-first | `static-bg-v1` | Immutable build assets |
| `/api/*` | Network-first (5s timeout) | `api-bg-v1` | API with offline fallback |
| `/_next/data/*` | Network-first (3s timeout) | `dynamic-bg-v1` | Next.js data routes |
| Static assets (`.png`, `.woff2`, etc.) | Cache-first | `static-bg-v1` | Images, fonts, icons |
| HTML pages | Network-first + offline fallback | `dynamic-bg-v1` | Falls back to `/offline` |
| Everything else | Stale-while-revalidate | `dynamic-bg-v1` | Best effort |

### Offline Queue

Actions performed while offline are queued in IndexedDB (`bg-offline` database, `offline-queue` store) and replayed via Background Sync when connectivity returns.

```ts
import { queueOfflineAction } from '@/lib/pwa-utils';

// Queue an action when offline
if (!navigator.onLine) {
  await queueOfflineAction({
    url: '/api/v1/agents/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

## Install Prompt

The install banner appears when:
1. User has visited at least **2 times** (tracked in localStorage)
2. App is **not already installed** (standalone mode check)
3. Banner was **not dismissed** in the last 7 days

On iOS, it shows "Add to Home Screen" instructions since Safari doesn't support `beforeinstallprompt`.

## Push Notifications

### Setup

1. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` environment variable
2. Create backend endpoints:
   - `POST /api/v1/push/subscribe` — store subscription
   - `POST /api/v1/push/unsubscribe` — remove subscription

### Notification Types

| Type | Tag | When |
|---|---|---|
| Guardian activity | `guardian-activity` | Guardian acts on your blocks |
| Transfer | `transfer` | Incoming transfers/transactions |
| Price alert | `price-alert` | Owned asset price movement |
| Nexus neighbor | `nexus-neighbor` | Activity in adjacent blocks |

### Payload Format

```json
{
  "title": "Guardian Alert",
  "body": "Agent verified block #840000",
  "tag": "guardian-activity",
  "data": { "url": "/block/840000" },
  "actions": [
    { "action": "view", "title": "View Block" }
  ]
}
```

## Mobile Navigation

Bottom tab bar with 4 tabs (visible on screens < 768px):
- **Home** (`/`) — Landing page
- **Explore** (`/explore`) — Block explorer
- **Nexus** (`/nexus`) — 3D metaverse (cyan glow when active)
- **Profile** (`/profile`) — User profile

The desktop footer is hidden on mobile; the tab bar replaces it.

## Touch Optimizations

- **Tap feedback**: Active state scales to 0.97x on touch devices
- **Safe areas**: Padding for notched devices (iPhone X+)
- **Smooth scroll**: `-webkit-overflow-scrolling: touch` on iOS
- **No tap highlight**: Transparent tap highlight for app-like feel
- **Pull-to-refresh**: CSS class `.pull-to-refresh-indicator` ready for JS implementation

## Splash Screen

Only appears in PWA standalone mode, once per session. Shows:
- Animated DNA double helix (dual strand, glowing dots)
- "BLOCK GENOMICS" gradient text
- Loading progress bar
- Auto-dismisses after 2 seconds

## Configuration

### next.config.ts

The service worker file (`/sw.js`) has special cache headers:
- `Cache-Control: public, max-age=0, must-revalidate` — always fetch latest
- `Service-Worker-Allowed: /` — allows root scope

### layout.tsx

PWA meta tags added via Next.js `Metadata` and `Viewport` exports:
- `manifest` link
- `apple-web-app-capable`
- `apple-web-app-status-bar-style: black-translucent`
- `theme-color: #F7931A`
- `viewport-fit: cover` (for safe areas)
- Apple touch icon and favicon references

## Icon Generation

Regenerate icons after branding changes:

```bash
node scripts/generate-icons.js
```

Produces DNA helix + Bitcoin symbol icons at all required sizes using the `canvas` npm package.

## Testing

### Chrome Android
1. Open Chrome DevTools > Application > Manifest — verify all fields
2. Application > Service Workers — verify registration
3. Lighthouse > PWA audit — should pass all checks
4. Test install prompt flow

### Safari iOS
1. Open site in Safari
2. Tap Share > Add to Home Screen
3. Launch from home screen — should show splash, then app in standalone mode
4. Verify bottom tab bar appears, footer hidden

### Offline Testing
1. DevTools > Network > Offline
2. Navigate — should show offline page for uncached routes
3. Previously visited pages should load from cache
4. Queue an action, go online — should replay

## Version Management

Update `CACHE_VERSION` in `public/sw.js` when deploying breaking changes to force cache refresh:

```js
const CACHE_VERSION = 'bg-v2'; // bump this
```

The service worker will automatically clean up old cache versions on activation.
