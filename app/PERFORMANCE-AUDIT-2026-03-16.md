# Block Genomics — Performance Audit
**Date:** 2026-03-16
**Target:** Lighthouse 90+, <200KB initial JS, smooth on budget phones

---

## Executive Summary

The landing page renders **two simultaneous Three.js Canvas scenes** with bloom post-processing,
900+ particles, 180 instanced towers, 7 DNA helixes, and 60 energy connections — all before the
user sees any content (3.43s reveal delay). This is the single biggest performance blocker.
Combined with `import * as THREE` preventing tree-shaking and triple-duplicate API calls,
the initial bundle is far above the 200KB target.

---

## Top 10 Performance Wins (Ordered by Impact)

### 1. TWO SIMULTANEOUS THREE.JS CANVAS SCENES ON LANDING 🔴 Critical
**Files:** `src/components/LandingBackground.tsx`, `src/components/LandingAnimation.tsx`
**Impact:** ~500KB+ JS, 2 WebGL contexts, continuous GPU load
**Problem:** The landing page mounts two full `<Canvas>` components simultaneously:
- **LandingBackground:** 180 instanced block towers, 7 DNA helixes (each with tube geometry),
  900 particles (3 layers), 60 energy connections, 25 data streams, aurora bands, light shafts,
  plus Bloom + ChromaticAberration + Vignette post-processing
- **LandingAnimation:** 28 emoji-textured sprites, 36 burst sprites, 300 ambient particles,
  wireframe cubes, energy rings, Bloom post-processing

Budget phones cannot handle 2 WebGL contexts + 2 bloom passes. Many will drop to <10fps or crash.

**Fix:**
- Merge into a single Canvas scene
- Use `navigator.hardwareConcurrency` / `navigator.deviceMemory` to detect budget devices
- On low-end: skip post-processing, reduce particle count by 75%, reduce tower count to 40
- Consider a CSS/SVG fallback for very low-end devices
- **Estimated savings: 200-400KB JS, 60%+ GPU reduction on mobile**

### 2. `import * as THREE` PREVENTS TREE-SHAKING 🔴 Critical
**Files:** 11 files import the entire Three.js library
**Impact:** ~150-200KB wasted bundle size
**Problem:** `import * as THREE from 'three'` pulls in the entire Three.js module (~600KB uncompressed).
The bundler cannot tree-shake because `THREE.Vector3`, `THREE.Color`, etc. are accessed as
properties of the namespace object.

**Fix:** Replace with named imports:
```ts
// Before
import * as THREE from 'three';
new THREE.Vector3(...)

// After
import { Vector3, Color, MathUtils, ... } from 'three';
new Vector3(...)
```
**Estimated savings: 100-200KB initial JS**

### 3. TRIPLE DUPLICATE mempool.space API CALL 🟡 Medium
**Files:** `LiveBlockCount.tsx`, `LiveStats.tsx`, `RotatingTagline.tsx`
**Impact:** 3 redundant network requests on every landing page load
**Problem:** All three components independently fetch `https://mempool.space/api/blocks/tip/height`
on mount. Additionally, both `LiveStats.tsx` and `Footer.tsx` independently fetch `/api/v1/stats`.

**Fix:** Create a shared hook or context that fetches once and distributes:
```ts
// useBlockHeight.ts — single source of truth
const cache = { height: null, ts: 0 };
export function useBlockHeight() { ... }
```
**Estimated savings: 4 eliminated API calls per page load**

### 4. 71 CLIENT COMPONENTS — MASSIVE CLIENT BOUNDARY 🟡 Medium
**Files:** Every component in `src/components/` is `"use client"`
**Impact:** All component JS shipped to client, no server rendering benefits
**Problem:** The root layout wraps everything in `GlobalWalletProvider` + `AuthProvider` (both
"use client"), which forces the entire component tree client-side. Header, Footer, GlobalSearch,
and WalletConnect are all eagerly loaded on every page.

**Fix:**
- Make Header/Footer server components, push "use client" to leaf interactive elements only
- Lazy-load WalletConnect and GlobalSearch (they're not needed at first paint)
- Split providers: move wallet context to a dedicated wrapper that only wraps pages needing it
**Estimated savings: 30-50KB initial JS, faster FCP**

### 5. FRAMER MOTION BUNDLED FOR 2 COMPONENTS 🟡 Medium
**Files:** `package.json`, `src/app/runebolt/page.tsx`, `src/app/runebolt/components/AssetDashboard.tsx`
**Impact:** ~52KB gzipped added to shared bundle
**Problem:** framer-motion is a top-level dependency but only used in 2 RuneBolt components.
If it ends up in shared chunks, every page pays the cost.

**Fix:**
- Dynamic import the RuneBolt components that use framer-motion
- Or replace with CSS animations (the RuneBolt usage is likely simple enough)
- Add to `optimizePackageImports` in next.config.ts
**Estimated savings: ~52KB gzipped if eliminated from shared chunks**

### 6. 3.43-SECOND CONTENT DELAY (LandingReveal) 🟡 Medium
**Files:** `src/components/LandingReveal.tsx`, `src/components/LandingPage.tsx`
**Impact:** Terrible LCP/FCP, perceived as broken on slow connections
**Problem:** Content is hidden for 3.43 seconds behind a "Verifying identity..." animation.
Users on slow connections see nothing. Lighthouse will score FCP/LCP very poorly.

**Fix:**
- Show content immediately with the animation playing *behind* it (not blocking it)
- Or reduce reveal delay to <1.5s
- Use `requestIdleCallback` to defer animation setup
**Estimated savings: LCP improvement from ~4s to <1.5s**

### 7. LandingBackground POST-PROCESSING OVERKILL 🟡 Medium
**Files:** `src/components/LandingBackground.tsx`
**Impact:** Extra render passes per frame, GPU memory
**Problem:** The background uses `Bloom` + `ChromaticAberration` + `Vignette` — three
post-processing passes. Bloom alone requires multiple render-to-texture passes with mipmapping.
ChromaticAberration is purely aesthetic. Budget phones will struggle.

**Fix:**
- Remove ChromaticAberration (barely visible)
- Make Vignette a CSS overlay instead (`box-shadow: inset`)
- On mobile: skip Bloom entirely, use emissive materials for glow approximation
**Estimated savings: 50%+ GPU per frame on mobile**

### 8. PRISMA N+1 QUERIES IN API ROUTES 🟡 Medium
**Files:** `api/v1/world/batch/route.ts`, `api/v1/admin/cleanup-duplicates/route.ts`,
`api/v1/brain/cron/route.ts`, `api/v1/brain/scan/route.ts`
**Impact:** O(N) database queries where O(1) is possible
**Problem:** Multiple API routes have `findUnique`/`findMany` inside loops:
- `world/batch`: `findUnique` in a for loop (up to 100 queries)
- `admin/cleanup-duplicates`: `findUnique` + `delete` in a for loop
- `brain/cron` & `brain/scan`: `findMany` inside `Promise.all(items.map(...))`

**Fix:** Batch queries with `findMany({ where: { id: { in: ids } } })`, then process in memory.
**Estimated savings: 10-100x faster API response times for affected routes**

### 9. NO GEOMETRY/MATERIAL DISPOSAL IN THREE.JS COMPONENTS 🟢 Low
**Files:** `LandingAnimation.tsx`, `LandingBackground.tsx`, nexus 3D components
**Impact:** GPU memory leaks on page navigation
**Problem:** Three.js geometries, materials, and textures created in `useMemo` are never
explicitly disposed when the component unmounts. The `EnergyConnections` component does
dispose (good), but most others don't.

**Fix:** Add cleanup in useEffect return:
```ts
useEffect(() => {
  return () => {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  };
}, []);
```
**Estimated savings: Prevents GPU memory leaks, especially on SPA navigation**

### 10. GLOBAL `window.addEventListener('mousemove')` AT MODULE SCOPE 🟢 Low
**Files:** `src/components/LandingBackground.tsx:36-41`
**Impact:** Event listener added at import time, never removed
**Problem:** The module-level `window.addEventListener('mousemove', ...)` runs as soon as
the module is imported and is never cleaned up. This means:
- The listener persists even after navigating away from the landing page
- It runs on every page that imports this module transitively

**Fix:** Move into a useEffect with proper cleanup, or use a ref-based approach.

---

## Bundle Size Analysis

### Heaviest Dependencies (estimated gzipped)
| Package | Size (gzip) | Used On |
|---------|------------|---------|
| three | ~150KB | Landing, Nexus, DNA, Whitepaper |
| @react-three/fiber | ~45KB | Same as three |
| @react-three/drei | ~35KB | Same as three |
| @react-three/postprocessing + postprocessing | ~40KB | Landing, DNA |
| framer-motion | ~52KB | RuneBolt only (2 files) |
| @supabase/supabase-js | ~30KB | API routes, contexts |
| sats-connect | ~20KB | Wallet connect |
| bip322-js | ~15KB | Signature verification |
| canvas (node) | N/A | Server-only (thumbnail gen) |

### Three.js Total: ~270KB gzipped (landing page alone)
This is **135% of the 200KB budget** just for the 3D engine.

---

## Quick Wins Implemented (Top 3)

### Fix 1: Named THREE.js imports (tree-shaking)
Replaced `import * as THREE` with specific named imports in `LandingAnimation.tsx`
and `LandingBackground.tsx` to enable webpack tree-shaking.

### Fix 2: Mobile-aware LandingBackground
Added device capability detection. On mobile/low-end devices:
- Reduced particle counts by 66%
- Reduced block tower count from 180 to 60
- Removed ChromaticAberration post-processing
- Replaced Vignette with CSS
- Reduced DNA helix count from 7 to 3

### Fix 3: Deduplicated mempool.space API calls
Created `src/hooks/useBlockHeight.ts` shared hook with module-level cache.
Landing page components now share a single fetch instead of 3 independent ones.

---

## Recommendations for Next Sprint

1. **Merge two Canvas scenes** into one (LandingAnimation + LandingBackground)
2. **Reduce LandingReveal delay** from 3.43s to <1.5s (or make non-blocking)
3. **Move framer-motion** to dynamic imports or replace with CSS
4. **Server-component refactor**: Make Header/Footer server components
5. **Fix Prisma N+1** queries in brain/cron, brain/scan, world/batch
6. **Add `React.memo`** to Header NavLink, Footer, and other stable components
7. **Lazy-load WalletConnect** — most users land without a wallet extension
8. **Add Three.js geometry disposal** in useEffect cleanup
9. **Consider Canvas 2D fallback** for landing on devices without WebGL2

---

*Audit performed by Claude — Block Genomics Performance Engineering*
