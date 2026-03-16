# Block Genomics UI/UX Audit — 2026-03-16

**Auditor:** Senior UI/UX Engineer (Claude)
**Scope:** 16 routes, 48 components, 216 TypeScript files
**Stack:** Next.js 16, Three.js, Framer Motion, Tailwind CSS v4, sats-connect

---

## Executive Summary

Block Genomics is a visually ambitious Bitcoin metaverse platform. The dark-theme aesthetic is cohesive and the Three.js/Framer Motion animations create a premium feel. However, there are systemic accessibility gaps, mobile edge cases, and missing loading/error states that undercut the experience. Below are findings ranked P0-P2.

---

## P0 — Critical (Fix immediately)

### P0-1: Modals not dismissible via ESC key
**Where:** `/marketplace`, `/components/LightningPayModal`, `/components/nexus/TransferPrepModal`
**Issue:** GateModal and other modals only dismiss on backdrop click or button. No keyboard escape path. Users relying on keyboard navigation are trapped.
**Fix:** Add `useEffect` with `keydown` listener for Escape. **IMPLEMENTED in marketplace GateModal.**

### P0-2: NexusDetailPanel completely covers mobile viewport
**Where:** `/components/nexus/NexusDetailPanel.tsx`
**Issue:** Fixed `w-80` (320px) panel doesn't adapt. On screens < 320px it overflows; on typical mobile it leaves no room to see the map beneath.
**Fix:** Changed to `w-full sm:w-80` — full-screen drawer on mobile, side panel on desktop. **IMPLEMENTED.**

### P0-3: iframes missing `title` attribute (WCAG 2.1 4.1.2)
**Where:** `/live` page
**Issue:** Livestream iframes have no `title`, making them invisible to screen readers.
**Fix:** Added descriptive title with block number and owner handle. **IMPLEMENTED.**

### P0-4: No error fallback if Nexus 3D map fails to load
**Where:** `/nexus/page.tsx`
**Issue:** `dynamic(() => import(...))` for NexusMap has no error boundary. If WebGL fails (old devices, privacy browsers), user sees a blank black screen with no recovery path.
**Recommendation:** Add React Error Boundary wrapping the Canvas with a fallback: "Your browser doesn't support 3D. Try Chrome/Safari." + link to `/explore`.

### P0-5: Silent API failures across multiple pages
**Where:** `/brain`, `/marketplace`, `/live`, `/explore`
**Issue:** `catch(() => {})` or `catch { /* silent */ }` — user never knows data failed to load. They see fallback zeros or empty states that look intentional.
**Recommendation:** Show a subtle inline error banner: "Couldn't load data. Tap to retry." with exponential backoff.

---

## P1 — High Priority (Fix this sprint)

### P1-1: Brain transparency log table overflows on mobile
**Where:** `/brain/page.tsx`
**Issue:** 4-column table overflows without any scroll affordance. Users don't know they can scroll right.
**Fix:** Added `min-w-[600px]`, `role="region"`, `aria-label`, and touch scroll hint. **IMPLEMENTED.**

### P1-2: Marketplace filter inputs missing aria-labels
**Where:** `/marketplace/page.tsx`
**Issue:** Search, min price, max price inputs have placeholder text but no aria-label. Screen readers announce them as generic "edit text."
**Fix:** Added `aria-label` to all three inputs + `aria-hidden` on decorative separator. **IMPLEMENTED.**

### P1-3: No skeleton loaders for dynamic Three.js components
**Where:** `/agent/[handle]`, `/nexus`, `/nexus/parcel/[height]`
**Issue:** Dynamic imports with `ssr: false` show nothing while loading. Users see a blank space for 1-3 seconds before the 3D canvas appears.
**Recommendation:** Add shimmer skeleton matching the canvas dimensions. Use `loading` prop of `dynamic()` or a Suspense fallback with a pulsing placeholder.

### P1-4: Connect flow doesn't persist across refresh
**Where:** `/connect/page.tsx`
**Issue:** Multi-step connection flow (wallet detect -> sign -> create profile) loses all progress on page refresh. If signing takes time and user accidentally navigates away, they start over.
**Recommendation:** Use `sessionStorage` to persist current step and wallet address.

### P1-5: Mobile hamburger menu doesn't close on route change (edge case)
**Where:** `/components/Header.tsx`
**Issue:** Menu closes on link click via `onClick={() => setMenuOpen(false)}`, but if user navigates via browser back/forward, menu state persists.
**Recommendation:** Add `useEffect` watching `pathname` to close menu.

### P1-6: Color-only status indicators (color-blind users)
**Where:** `/directory`, `/nexus/NexusDetailPanel.tsx`, `/brain`
**Issue:** Online/offline status and claimed/unclaimed use only a green/gray dot. Red-green color-blind users can't distinguish states.
**Recommendation:** Add secondary indicator — text label, icon change, or pattern difference alongside color.

### P1-7: Agent page is 53KB+ — needs code splitting
**Where:** `/agent/[handle]/page.tsx`
**Issue:** Single component file with chat, DNA visualizer, profile, real-time updates. Monolithic file hurts both DX and initial load.
**Recommendation:** Extract chat, profile card, and DNA sections into separate components. Lazy-load chat and DNA visualizer.

### P1-8: Redirect pages show blank screen during redirect
**Where:** `/block/[height]`, `/leaderboard`
**Issue:** Server-side `redirect()` shows a momentary blank white flash before navigation completes.
**Recommendation:** Use Next.js `redirect()` in a server component (already done), but add `loading.tsx` files to these route segments with a spinner.

### P1-9: Marketplace sticky filter bar may overlap header
**Where:** `/marketplace/page.tsx`
**Issue:** `sticky top-16` assumes header is exactly 64px. If header height changes (e.g., banner added), filters disappear behind it.
**Recommendation:** Use CSS custom property `--header-height` set by Header component, then `top: var(--header-height)`.

---

## P2 — Medium Priority (Next sprint)

### P2-1: Inconsistent dark mode approach
**Where:** Project-wide
**Issue:** Mix of hardcoded hex values (`#0a0a12`, `#12121f`), CSS variables (`var(--bg-primary)`), and Tailwind classes (`bg-bg-primary`). Some pages use inline styles exclusively (live, marketplace), others use the theme system.
**Recommendation:** Standardize on Tailwind CSS variables from `globals.css`. Replace all hardcoded colors with token references.

### P2-2: No focus-visible styles on custom buttons
**Where:** Most custom-styled buttons across the app
**Issue:** Buttons with custom `background` inline styles don't show browser focus ring. Tab-navigating users can't see what's focused.
**Recommendation:** Add `focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a12]` globally via Tailwind plugin or on each button.

### P2-3: Emoji used as semantic icons
**Where:** `/brain` (navigation icons), `/marketplace` (CTA buttons), `/live` (tab labels)
**Issue:** Emoji rendering varies by OS. "🔍" looks different on Windows vs macOS vs Android. Professional apps use icon libraries for consistency.
**Recommendation:** Replace functional emoji (search, share, status) with Lucide icons (already installed). Keep decorative emoji (hero sections) as-is.

### P2-4: WhitePaper page accessibility unknown
**Where:** `/whitepaper`
**Issue:** Delegates entirely to a client component. If it's a long document, it likely needs heading hierarchy, skip-to-content, and proper reading order.
**Recommendation:** Audit the WhitePaperClient component separately.

### P2-5: RuneBolt page has mock/static wallet data
**Where:** `/runebolt/page.tsx`
**Issue:** Displays a static wallet address and mock asset dashboard. If this is a demo, it should be clearly labeled. If it's production, it needs real data.
**Recommendation:** Add "Demo Mode" banner or connect to real wallet context.

### P2-6: Animation performance on low-end devices
**Where:** Landing page, `/agent/[handle]`, `/nexus`
**Issue:** Landing page has multiple `filter: drop-shadow()` effects, shimmer animations, and gradient text. Nexus has full Three.js scene. No `prefers-reduced-motion` media query respected anywhere.
**Recommendation:** Add `@media (prefers-reduced-motion: reduce)` to disable non-essential animations. For Three.js, reduce particle count and disable post-processing on mobile.

### P2-7: Toast notifications don't respect screen reader announcements
**Where:** `/profile/page.tsx`
**Issue:** Custom toast implementation uses `setTimeout` for auto-dismiss but doesn't use `role="alert"` or `aria-live="polite"`.
**Recommendation:** Add `role="status"` and `aria-live="polite"` to toast container.

### P2-8: Mobile search in header shows twice
**Where:** `/components/Header.tsx`
**Issue:** `GlobalSearch` appears in both the desktop header bar and the mobile dropdown menu. When menu is open, two search bars are visible simultaneously.
**Recommendation:** Hide the header-level search on mobile (`hidden md:block`) and only show it in the dropdown.

### P2-9: No empty search results state in GlobalSearch
**Where:** `/components/GlobalSearch.tsx`
**Issue:** When search returns no results, the dropdown just shows nothing. No "No results found" message.
**Recommendation:** Add empty state with suggestion to try different keywords.

### P2-10: Share buttons use inline event handlers for hover
**Where:** `/components/nexus/NexusDetailPanel.tsx`
**Issue:** `onMouseEnter`/`onMouseLeave` inline handlers manipulate `style` directly. This is fragile, doesn't work with touch, and defeats CSS optimization.
**Recommendation:** Replace with Tailwind `hover:` classes or CSS-in-JS.

---

## What's Working Well

- **Responsive grid layouts** — Consistent use of `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` across marketplace, live, directory
- **Header mobile menu** — Animated hamburger with smooth rotation transform
- **GlobalSearch** — Keyboard navigation (arrow keys, Enter, Escape, Cmd+K), debounced API calls
- **Three.js performance** — `useMemo` for geometries, `InstancedMesh` for particles, DPR-aware rendering
- **Loading states on complex flows** — Verify, connect, and marketplace have thoughtful multi-step feedback
- **CrownShield component** — Beautifully crafted SVG tier badges with consistent sizing
- **Dark theme cohesion** — Cyan/purple/orange palette is distinctive and consistent in spirit

---

## Quick Fixes Implemented (this audit)

| # | Fix | File | Change |
|---|-----|------|--------|
| 1 | ESC key dismisses marketplace gate modal | `marketplace/page.tsx` | Added `useEffect` keydown listener + `role="dialog"` + `aria-modal` |
| 2 | NexusDetailPanel responsive on mobile | `nexus/NexusDetailPanel.tsx` | `w-80` -> `w-full sm:w-80` (full-screen drawer on mobile) |
| 3 | iframe accessibility title | `live/page.tsx` | Added descriptive `title` attribute to stream iframes |
| 4 | Brain log table mobile scroll | `brain/page.tsx` | Added `min-w-[600px]`, `role="region"`, `aria-label`, touch scroll |
| 5 | Marketplace filter aria-labels | `marketplace/page.tsx` | Added `aria-label` to search, min price, max price inputs |

---

## Recommended Next Steps (Priority Order)

1. Add React Error Boundary around all Three.js/Canvas components (P0-4)
2. Replace silent `catch(() => {})` with retry-able error UI (P0-5)
3. Add skeleton loaders for dynamic imports (P1-3)
4. Standardize color tokens project-wide (P2-1)
5. Add `prefers-reduced-motion` support (P2-6)
6. Replace functional emoji with Lucide icons (P2-3)
7. Add focus-visible styles globally (P2-2)

---

*Generated 2026-03-16. 5 files modified, 0 new dependencies.*
