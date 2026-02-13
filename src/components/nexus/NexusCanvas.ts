// Canvas rendering engine for The Nexus block map

import {
  getEpoch, getEpochColor, isSpecialBlock,
  heightToGrid, gridToHeight,
  COLS, TOTAL_BLOCKS, generateBlock,
} from './NexusBlockData';
import type { Visitor } from './NexusSocial';
import { getLandmark } from './NexusLandmarks';

/**
 * PROTOCOL RULE: Each Bitcoin block (Bitmap) = 2.1km × 2.1km in real-world scale.
 * All spatial dimensions, VR experiences, artifacts, and developments built on land
 * MUST anchor to this scale. A human avatar ≈ 1.8m, a building ≈ 10-100m, etc.
 * This ensures consistent spatial experience across all blocks and in VR.
 *
 * CELL_SIZE is the visual representation in the world map; the 2.1km rule applies
 * inside ParcelView where parcels divide the 2.1km² block proportionally by vbytes.
 */
const CELL_SIZE = 10; // base cell size in world pixels (map-level representation)
const GAP = 1;
const UNIT = CELL_SIZE + GAP;

// Seeded random for deterministic brightness per block
function seededRand(seed: number): number {
  let s = (seed * 1664525 + 1013904223) & 0xffffffff;
  return (s >>> 0) / 0xffffffff;
}

export interface Camera {
  x: number; // world x (center)
  y: number; // world y (center)
  zoom: number;
}

export type ZoomLevel = 'galaxy' | 'region' | 'block';

export function getZoomLevel(zoom: number): ZoomLevel {
  if (zoom < 0.15) return 'galaxy';
  if (zoom < 1.5) return 'region';
  return 'block';
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

// Cyberpunk rain drop
interface RainDrop {
  x: number; y: number; speed: number; length: number; opacity: number;
}

// Cyberpunk glitch segment
interface GlitchSegment {
  y: number; h: number; offset: number; time: number;
}

export class NexusCanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: Camera = { x: 0, y: 0, zoom: typeof window !== 'undefined' && window.innerWidth < 768 ? 0.15 : 0.05 };
  private targetCamera: Camera = { x: 0, y: 0, zoom: typeof window !== 'undefined' && window.innerWidth < 768 ? 0.15 : 0.05 };
  private animFrameId = 0;
  private hoveredBlock: number | null = null;
  private selectedBlock: number | null = null;
  private particles: Particle[] = [];
  private time = 0;
  private onBlockSelect: ((height: number | null) => void) | null = null;
  private onHoverBlock: ((height: number | null) => void) | null = null;
  private onVisitorSelect: ((visitor: Visitor | null, x: number, y: number) => void) | null = null;
  private onVisitorHover: ((visitor: Visitor | null, x: number, y: number) => void) | null = null;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private lastMouse = { x: 0, y: 0 };
  private pulseTime = 0;
  private visitors: Visitor[] = [];
  private visitorCounts = new Map<number, number>();
  private hoveredVisitorId: string | null = null;

  // Parcel preview cache (LRU)
  private parcelCache = new Map<number, HTMLCanvasElement | OffscreenCanvas>();
  private parcelCacheOrder: number[] = [];
  private static readonly PARCEL_CACHE_MAX = 500;
  private static readonly PARCEL_TEX_SIZE = 128;

  // Async texture generation budget (max textures generated per frame)
  private static readonly TEX_BUDGET_PER_FRAME = 3; // reduced from 6 for smoother frame rate
  private texGenQueue: number[] = []; // blocks waiting for texture generation
  private texGenSet = new Set<number>(); // fast lookup for queue membership

  // Double-click detection
  private lastClickTime = 0;
  private lastClickBlock: number | null = null;
  private onBlockEnter: ((height: number) => void) | null = null;

  // Cyberpunk mode
  private _cyberpunk = false;
  private rainDrops: RainDrop[] = [];
  private glitchSegments: GlitchSegment[] = [];
  private glitchTimer = 0;
  private neonFlicker = 1;

  // Touch handling
  private lastTouchDist = 0;
  private lastTouchCenter = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.initParticles();
    this.initRain();
  }

  // Cyberpunk toggle
  get cyberpunk() { return this._cyberpunk; }
  setCyberpunk(on: boolean) {
    this._cyberpunk = on;
    if (on && this.rainDrops.length === 0) this.initRain();
  }

  setOnBlockEnter(cb: (height: number) => void) {
    this.onBlockEnter = cb;
  }

  /** Returns cached texture or null (and enqueues async generation) */
  private getParcelTextureCached(height: number): (HTMLCanvasElement | OffscreenCanvas) | null {
    const cached = this.parcelCache.get(height);
    if (cached) {
      // Move to end of LRU
      const idx = this.parcelCacheOrder.indexOf(height);
      if (idx !== -1) {
        this.parcelCacheOrder.splice(idx, 1);
        this.parcelCacheOrder.push(height);
      }
      return cached;
    }
    // Enqueue for async generation if not already queued
    if (!this.texGenSet.has(height)) {
      this.texGenQueue.push(height);
      this.texGenSet.add(height);
    }
    return null;
  }

  /** Synchronously generate one parcel texture and cache it */
  private generateParcelTexture(height: number): void {
    if (this.parcelCache.has(height)) return;
    const size = NexusCanvasEngine.PARCEL_TEX_SIZE;
    const tex = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : (() => { const c = document.createElement('canvas'); c.width = size; c.height = size; return c; })();
    const tctx = tex.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (!tctx) return;

    const block = generateBlock(height);
    const txCount = block.txCount;
    const rng = (seed: number) => seededRand(seed);

    // Generate tx bytes with realistic power-law distribution (matching ParcelView)
    const txBytes: number[] = [];
    let rngState = height * 7919;
    const nextR = () => { rngState = (rngState * 1664525 + 1013904223) & 0xffffffff; return (rngState >>> 0) / 0xffffffff; };
    for (let i = 0; i < txCount; i++) {
      if (i === 0) {
        txBytes.push(200 + Math.floor(nextR() * 400));
      } else {
        // Power-law distribution matching ParcelView
        const u = nextR();
        const exp = Math.pow(u, 3);
        txBytes.push(Math.floor(150 + exp * 500000));
      }
    }

    const totalBytes = txBytes.reduce((s, b) => s + b, 0);
    // Proportional gap calculated after gridW is known (see below)
    let cellGap = 1.5;

    // Dark background
    tctx.fillStyle = '#0a0a0f';
    tctx.fillRect(0, 0, size, size);


    // Bitfeed-standard Mondrian square packing (each tx = square, side = ceil(sqrt(vbytes/256)))
    interface TexRect { index: number; x: number; y: number; w: number; h: number; }
    const rects: TexRect[] = [];

    const squares = txBytes.map((b, i) => ({ idx: i, gridSize: Math.max(1, Math.ceil(Math.sqrt(b / 256))) }));
    squares.sort((a, b) => b.gridSize - a.gridSize);

    const totalGridArea = squares.reduce((s, sq) => s + sq.gridSize * sq.gridSize, 0);
    const gridW = Math.ceil(Math.sqrt(totalGridArea));
    const pxPerGrid = size / gridW;
    cellGap = pxPerGrid * 0.12; // ~12% of cell = proportional dark gutters (matches Bitmap.Community)

    // Occupancy grid
    const gridH = gridW + 20;
    const occ: boolean[][] = [];
    for (let r = 0; r < gridH; r++) occ.push(new Array(gridW).fill(false));

    for (const sq of squares) {
      const gs = sq.gridSize;
      let placed = false;
      for (let row = 0; row < gridH - gs + 1 && !placed; row++) {
        for (let col = 0; col <= gridW - gs && !placed; col++) {
          let fits = true;
          for (let dr = 0; dr < gs && fits; dr++)
            for (let dc = 0; dc < gs && fits; dc++)
              if (occ[row + dr][col + dc]) fits = false;
          if (fits) {
            for (let dr = 0; dr < gs; dr++)
              for (let dc = 0; dc < gs; dc++)
                occ[row + dr][col + dc] = true;
            rects.push({
              index: sq.idx,
              x: col * pxPerGrid + cellGap / 2,
              y: row * pxPerGrid + cellGap / 2,
              w: Math.max(0.5, gs * pxPerGrid - cellGap),
              h: Math.max(0.5, gs * pxPerGrid - cellGap),
            });
            placed = true;
          }
        }
      }
    }


    // Draw parcels
    for (const rect of rects) {
      if (rect.index === 0) {
        tctx.fillStyle = '#f7931a'; // coinbase
      } else {
        const hue = 20 + seededRand(height * 1000 + rect.index + 7777) * 25;
        const sat = 70 + seededRand(height * 1000 + rect.index + 3333) * 25;
        const val = seededRand(height * 1000 + rect.index);
        const light = 15 + val * 45;
        tctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      tctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    // LRU eviction
    if (this.parcelCacheOrder.length >= NexusCanvasEngine.PARCEL_CACHE_MAX) {
      const evict = this.parcelCacheOrder.shift()!;
      this.parcelCache.delete(evict);
    }
    this.parcelCache.set(height, tex);
    this.parcelCacheOrder.push(height);
  }

  /** Process queued texture generation (called once per frame, budget-limited) */
  private processTextureQueue(): void {
    if (this.texGenQueue.length === 0) return;

    // Sort queue by distance to camera center (prioritize visible center blocks)
    const camCol = Math.round(this.camera.x / UNIT);
    const camRow = Math.round(this.camera.y / UNIT);
    this.texGenQueue.sort((a, b) => {
      const aCol = a % COLS, aRow = Math.floor(a / COLS);
      const bCol = b % COLS, bRow = Math.floor(b / COLS);
      const aDist = (aCol - camCol) ** 2 + (aRow - camRow) ** 2;
      const bDist = (bCol - camCol) ** 2 + (bRow - camRow) ** 2;
      return aDist - bDist;
    });

    let generated = 0;
    while (generated < NexusCanvasEngine.TEX_BUDGET_PER_FRAME && this.texGenQueue.length > 0) {
      const h = this.texGenQueue.shift()!;
      this.texGenSet.delete(h);
      // Only generate if still not cached (may have been generated in a previous pass)
      if (!this.parcelCache.has(h)) {
        this.generateParcelTexture(h);
        generated++;
      }
    }
  }

  private initRain() {
    this.rainDrops = [];
    for (let i = 0; i < 200; i++) {
      this.rainDrops.push(this.createRainDrop(true));
    }
  }

  private createRainDrop(randomY = false): RainDrop {
    return {
      x: Math.random() * 3000,
      y: randomY ? Math.random() * 2000 : -20,
      speed: 4 + Math.random() * 8,
      length: 15 + Math.random() * 30,
      opacity: 0.1 + Math.random() * 0.25,
    };
  }

  setCallbacks(
    onSelect: (h: number | null) => void,
    onHover: (h: number | null) => void,
    onVisitorSelect?: (visitor: Visitor | null, x: number, y: number) => void,
    onVisitorHover?: (visitor: Visitor | null, x: number, y: number) => void,
  ) {
    this.onBlockSelect = onSelect;
    this.onHoverBlock = onHover;
    this.onVisitorSelect = onVisitorSelect ?? null;
    this.onVisitorHover = onVisitorHover ?? null;
  }

  setVisitors(visitors: Visitor[]) {
    this.visitors = visitors;
    this.visitorCounts = new Map();
    for (const v of visitors) {
      const count = this.visitorCounts.get(v.blockHeight) ?? 0;
      this.visitorCounts.set(v.blockHeight, count + 1);
    }
  }

  getCamera(): Camera { return { ...this.camera }; }

  /** Set target zoom level (for resetting after exiting ParcelView) */
  setZoom(zoom: number) {
    this.targetCamera.zoom = zoom;
  }
  getSelectedBlock(): number | null { return this.selectedBlock; }
  getVisitorCount(height: number): number { return this.visitorCounts.get(height) ?? 0; }

  // World coordinates of grid
  private worldX(col: number) { return col * UNIT; }
  private worldY(row: number) { return row * UNIT; }

  // Screen <-> World transforms
  private worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      sx: (wx - this.camera.x) * this.camera.zoom + cx,
      sy: (wy - this.camera.y) * this.camera.zoom + cy,
    };
  }

  private screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      wx: (sx - cx) / this.camera.zoom + this.camera.x,
      wy: (sy - cy) / this.camera.zoom + this.camera.y,
    };
  }

  private blockToScreen(height: number): { sx: number; sy: number } {
    const { col, row } = heightToGrid(height);
    const wx = this.worldX(col) + CELL_SIZE / 2;
    const wy = this.worldY(row) + CELL_SIZE / 2;
    return this.worldToScreen(wx, wy);
  }

  private getVisitorAtScreen(sx: number, sy: number): Visitor | null {
    const radius = 6;
    for (const visitor of this.visitors) {
      const pos = this.blockToScreen(visitor.blockHeight);
      const dist = Math.hypot(pos.sx - sx, pos.sy - sy);
      if (dist <= radius) return visitor;
    }
    return null;
  }

  hitTest(sx: number, sy: number): number | null {
    const { wx, wy } = this.screenToWorld(sx, sy);
    const col = Math.floor(wx / UNIT);
    const row = Math.floor(wy / UNIT);
    if (col < 0 || col >= COLS) return null;
    return gridToHeight(col, row);
  }

  // Navigation
  navigateToBlock(height: number, instant = false) {
    const { col, row } = heightToGrid(height);
    const tx = this.worldX(col) + CELL_SIZE / 2;
    const ty = this.worldY(row) + CELL_SIZE / 2;
    this.targetCamera = { x: tx, y: ty, zoom: 2.5 };
    if (instant) {
      this.camera = { ...this.targetCamera };
    }
  }

  selectBlock(height: number | null) {
    this.selectedBlock = height;
    this.onBlockSelect?.(height);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Event handlers
  // Zoom threshold at which we auto-enter the hovered block
  // Auto-enter when ~4-6 blocks visible on screen (each block = 2.1km × 2.1km)
  private static readonly AUTO_ENTER_ZOOM = 24;

  handleWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    const newZoom = Math.max(0.01, Math.min(30, this.targetCamera.zoom * factor));
    // Zoom toward mouse position
    const { wx, wy } = this.screenToWorld(e.offsetX, e.offsetY);
    const ratio = newZoom / this.targetCamera.zoom;
    this.targetCamera.x = wx - (wx - this.targetCamera.x) / ratio;
    this.targetCamera.y = wy - (wy - this.targetCamera.y) / ratio;
    this.targetCamera.zoom = newZoom;

    // When zooming out past block level, flush pending texture queue
    if (getZoomLevel(newZoom) !== 'block') {
      this.texGenQueue.length = 0;
      this.texGenSet.clear();
    }

    // Auto-enter block when zoomed deep enough on a hovered block
    if (newZoom >= NexusCanvasEngine.AUTO_ENTER_ZOOM && this.hoveredBlock !== null) {
      this.onBlockEnter?.(this.hoveredBlock);
    }
  }

  handleMouseDown(e: MouseEvent) {
    this.isDragging = true;
    this.dragStart = { x: e.offsetX, y: e.offsetY };
    this.lastMouse = { x: e.offsetX, y: e.offsetY };
  }

  handleMouseMove(e: MouseEvent) {
    if (this.isDragging) {
      const dx = (e.offsetX - this.lastMouse.x) / this.camera.zoom;
      const dy = (e.offsetY - this.lastMouse.y) / this.camera.zoom;
      this.targetCamera.x -= dx;
      this.targetCamera.y -= dy;
      this.camera.x -= dx;
      this.camera.y -= dy;
      this.lastMouse = { x: e.offsetX, y: e.offsetY };
    } else {
      const visitor = this.getVisitorAtScreen(e.offsetX, e.offsetY);
      if (visitor?.id !== this.hoveredVisitorId) {
        this.hoveredVisitorId = visitor?.id ?? null;
        this.onVisitorHover?.(visitor ?? null, e.offsetX, e.offsetY);
      } else if (!visitor && this.hoveredVisitorId) {
        this.hoveredVisitorId = null;
        this.onVisitorHover?.(null, e.offsetX, e.offsetY);
      }

      if (visitor) {
        if (this.hoveredBlock !== null) {
          this.hoveredBlock = null;
          this.onHoverBlock?.(null);
        }
      } else {
        const h = this.hitTest(e.offsetX, e.offsetY);
        if (h !== this.hoveredBlock) {
          this.hoveredBlock = h;
          this.onHoverBlock?.(h);
        }
      }
    }
  }

  handleMouseUp(e: MouseEvent) {
    const dist = Math.hypot(e.offsetX - this.dragStart.x, e.offsetY - this.dragStart.y);
    if (dist < 5) {
      const visitor = this.getVisitorAtScreen(e.offsetX, e.offsetY);
      if (visitor) {
        this.onVisitorSelect?.(visitor, e.offsetX, e.offsetY);
      } else {
        const h = this.hitTest(e.offsetX, e.offsetY);
        const now = performance.now();
        if (h !== null && h === this.lastClickBlock && now - this.lastClickTime < 300) {
          // Double-click — enter block
          this.onBlockEnter?.(h);
          this.lastClickTime = 0;
          this.lastClickBlock = null;
        } else {
          this.lastClickTime = now;
          this.lastClickBlock = h;
          this.selectBlock(h);
        }
      }
    }
    this.isDragging = false;
  }

  handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.dragStart = { ...this.lastMouse };
    } else if (e.touches.length === 2) {
      this.isDragging = false;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      this.lastTouchDist = Math.hypot(dx, dy);
      this.lastTouchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  }

  handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && this.isDragging) {
      const dx = (e.touches[0].clientX - this.lastMouse.x) / this.camera.zoom;
      const dy = (e.touches[0].clientY - this.lastMouse.y) / this.camera.zoom;
      this.targetCamera.x -= dx;
      this.targetCamera.y -= dy;
      this.camera.x -= dx;
      this.camera.y -= dy;
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / this.lastTouchDist;
      const newZoom = Math.max(0.01, Math.min(30, this.targetCamera.zoom * factor));
      this.targetCamera.zoom = newZoom;
      this.lastTouchDist = dist;

      // Auto-enter on pinch zoom too
      if (newZoom >= NexusCanvasEngine.AUTO_ENTER_ZOOM && this.hoveredBlock !== null) {
        this.onBlockEnter?.(this.hoveredBlock);
      }
    }
  }

  handleTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      if (this.isDragging) {
        const dist = Math.hypot(
          this.lastMouse.x - this.dragStart.x,
          this.lastMouse.y - this.dragStart.y
        );
        if (dist < 10) {
          const rect = this.canvas.getBoundingClientRect();
          const h = this.hitTest(this.lastMouse.x - rect.left, this.lastMouse.y - rect.top);
          this.selectBlock(h);
        }
      }
      this.isDragging = false;
    }
  }

  // Particles
  private initParticles() {
    for (let i = 0; i < 60; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    return {
      x: Math.random() * 2000 - 500,
      y: Math.random() * 2000 - 500,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      life: Math.random() * 200,
      maxLife: 200 + Math.random() * 200,
      color: Math.random() > 0.5 ? 'rgba(102,204,255,' : 'rgba(168,85,247,',
      size: 1 + Math.random() * 2,
    };
  }

  // Main render loop
  start() {
    const loop = () => {
      this.update();
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
  }

  private update() {
    this.time++;
    this.pulseTime += 0.02;

    // Process queued parcel texture generation (budget-limited per frame)
    this.processTextureQueue();

    // Smooth camera lerp
    const lerp = 0.12;
    this.camera.x += (this.targetCamera.x - this.camera.x) * lerp;
    this.camera.y += (this.targetCamera.y - this.camera.y) * lerp;
    this.camera.zoom += (this.targetCamera.zoom - this.camera.zoom) * lerp;

    // Cyberpunk updates
    if (this._cyberpunk) {
      // Rain
      for (const drop of this.rainDrops) {
        drop.y += drop.speed;
        if (drop.y > 2000) Object.assign(drop, this.createRainDrop());
      }
      // Glitch timer
      this.glitchTimer--;
      if (this.glitchTimer <= 0) {
        this.glitchSegments = [];
        if (Math.random() < 0.08) { // 8% chance per frame to glitch
          const count = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < count; i++) {
            this.glitchSegments.push({
              y: Math.random() * 2000,
              h: 2 + Math.random() * 8,
              offset: (Math.random() - 0.5) * 20,
              time: 2 + Math.floor(Math.random() * 4),
            });
          }
          this.glitchTimer = this.glitchSegments[0].time;
        } else {
          this.glitchTimer = 1;
        }
      }
      // Neon flicker
      this.neonFlicker = Math.random() < 0.03 ? 0.6 + Math.random() * 0.3 : 1;
    }

    // Update particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      if (p.life > p.maxLife) {
        Object.assign(p, this.createParticle());
        p.life = 0;
      }
    }
  }

  private render() {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const ctx = this.ctx;

    // Clear
    ctx.fillStyle = this._cyberpunk ? '#050510' : '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    const zoom = this.camera.zoom;
    const level = getZoomLevel(zoom);
    const cellScreen = CELL_SIZE * zoom;
    const unitScreen = UNIT * zoom;

    // Visible range in world coords
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(w, h);

    const colStart = Math.max(0, Math.floor(topLeft.wx / UNIT) - 1);
    const colEnd = Math.min(COLS - 1, Math.ceil(bottomRight.wx / UNIT) + 1);
    const rowStart = Math.max(0, Math.floor(topLeft.wy / UNIT) - 1);
    const rowEnd = Math.ceil(bottomRight.wy / UNIT) + 1;
    const maxRow = Math.ceil(TOTAL_BLOCKS / COLS);

    // Render blocks
    for (let row = rowStart; row <= Math.min(rowEnd, maxRow); row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const height = row * COLS + col;
        if (height >= TOTAL_BLOCKS || height < 0) continue;

        const sx = (this.worldX(col) - this.camera.x) * zoom + w / 2;
        const sy = (this.worldY(row) - this.camera.y) * zoom + h / 2;

        if (sx + cellScreen < -2 || sx > w + 2 || sy + cellScreen < -2 || sy > h + 2) continue;

        const epoch = getEpoch(height);
        const baseColor = getEpochColor(epoch);
        const brightness = 0.5 + seededRand(height) * 0.5;
        const special = isSpecialBlock(height);
        const landmark = getLandmark(height);

        if (level === 'galaxy') {
          // Single pixel mode
          ctx.fillStyle = baseColor;
          ctx.globalAlpha = brightness;
          ctx.fillRect(sx, sy, Math.max(1, cellScreen), Math.max(1, cellScreen));
          ctx.globalAlpha = 1;
        } else {
          // Draw cell
          ctx.fillStyle = baseColor;
          ctx.globalAlpha = brightness;
          ctx.fillRect(sx, sy, cellScreen, cellScreen);
          ctx.globalAlpha = 1;

          // Special block glow
          if (special) {
            const glowAlpha = 0.3 + 0.15 * Math.sin(this.pulseTime * 3 + height);
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 12 * zoom;
            ctx.fillStyle = baseColor;
            ctx.globalAlpha = glowAlpha;
            ctx.fillRect(sx, sy, cellScreen, cellScreen);
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
          }

          // Landmark marker
          if (landmark) {
            const markerSize = Math.max(6, cellScreen * 0.6);
            const centerX = sx + cellScreen / 2;
            const centerY = sy + cellScreen / 2;
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(Math.PI / 4);
            ctx.shadowColor = landmark.color;
            ctx.shadowBlur = 16 * zoom;
            ctx.fillStyle = landmark.color;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(-markerSize / 2, -markerSize / 2, markerSize, markerSize);
            ctx.globalAlpha = 1;
            ctx.restore();
          }

          // Hovered block highlight
          if (height === this.hoveredBlock) {
            ctx.strokeStyle = '#66ccff';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx - 1, sy - 1, cellScreen + 2, cellScreen + 2);
          }

          // Selected block highlight
          if (height === this.selectedBlock) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx - 2, sy - 2, cellScreen + 4, cellScreen + 4);
          }

          // Visitor count badge
          const visitorsHere = this.visitorCounts.get(height);
          if (visitorsHere && cellScreen > 8) {
            const badgeRadius = Math.max(6, cellScreen * 0.22);
            const bx = sx + cellScreen - badgeRadius;
            const by = sy + badgeRadius;
            ctx.fillStyle = 'rgba(10,10,15,0.85)';
            ctx.beginPath();
            ctx.arc(bx, by, badgeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(102,204,255,0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#66ccff';
            ctx.font = `${Math.max(8, badgeRadius)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${visitorsHere}`, bx, by + 0.5);
            ctx.textBaseline = 'alphabetic';
          }

          // Parcel preview at block zoom level
          if (level === 'block' && cellScreen > 30) {
            const tex = this.getParcelTextureCached(height);
            // Fade in between cellScreen 30-50
            const parcelAlpha = cellScreen < 50 ? (cellScreen - 30) / 20 : 1;
            if (tex) {
              ctx.globalAlpha = parcelAlpha;
              ctx.drawImage(tex as HTMLCanvasElement, sx, sy, cellScreen, cellScreen);
              ctx.globalAlpha = 1;
            } else {
              // Placeholder: subtle loading shimmer while texture generates
              const shimmer = 0.15 + 0.05 * Math.sin(this.pulseTime * 4 + height * 0.1);
              ctx.globalAlpha = parcelAlpha * shimmer;
              ctx.fillStyle = '#f7931a';
              ctx.fillRect(sx + 1, sy + 1, cellScreen - 2, cellScreen - 2);
              ctx.globalAlpha = 1;
            }

            // Block number overlay
            ctx.fillStyle = '#fff';
            ctx.font = `${Math.min(10, cellScreen * 0.25)}px monospace`;
            ctx.textAlign = 'center';
            ctx.globalAlpha = 0.7;
            ctx.fillText(`${height}`, sx + cellScreen / 2, sy + cellScreen / 2 + 3);
            ctx.globalAlpha = 1;
          }

          // Estate glow (~3% of blocks)
          if (seededRand(height * 7) < 0.03) {
            const neonColors = ['#00ffff', '#ff00ff', '#00ff66'];
            const neonColor = neonColors[Math.floor(seededRand(height * 13) * 3)];
            const glowPulse = 0.3 + 0.3 * Math.sin(this.pulseTime * 2 + height * 0.1);
            ctx.save();
            ctx.strokeStyle = neonColor;
            ctx.lineWidth = 2;
            ctx.globalAlpha = glowPulse;
            ctx.shadowColor = neonColor;
            ctx.shadowBlur = 10;
            ctx.strokeRect(sx - 1, sy - 1, cellScreen + 2, cellScreen + 2);
            ctx.restore();
          }
        }
      }
    }

    // Visitor presence dots
    if (this.visitors.length > 0 && level !== 'galaxy') {
      for (const visitor of this.visitors) {
        const { sx, sy } = this.blockToScreen(visitor.blockHeight);
        if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
        const pulse = 1 + Math.sin(this.pulseTime * 3 + visitor.blockHeight) * 0.15;
        const radius = 3.5 * pulse;
        ctx.beginPath();
        ctx.fillStyle = visitor.color;
        ctx.shadowColor = visitor.color;
        ctx.shadowBlur = visitor.id === this.hoveredVisitorId ? 12 : 6;
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Grid lines at region/block level
    if (level !== 'galaxy' && unitScreen > 4) {
      ctx.strokeStyle = 'rgba(102,204,255,0.05)';
      ctx.lineWidth = 0.5;
      // Draw epoch boundaries
      for (const hb of [0, 210000, 420000, 630000, 840000]) {
        const row = Math.floor(hb / COLS);
        const sy = (this.worldY(row) - this.camera.y) * zoom + h / 2;
        if (sy > -10 && sy < h + 10) {
          ctx.strokeStyle = 'rgba(247,147,26,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, sy);
          ctx.lineTo(w, sy);
          ctx.stroke();
        }
      }
    }

    // Particles (screen space)
    for (const p of this.particles) {
      const alpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color + (alpha * 0.4).toFixed(2) + ')';
      const px = ((p.x - this.camera.x * 0.02) % w + w) % w;
      const py = ((p.y - this.camera.y * 0.02) % h + h) % h;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // New block pulse animation (simulated at edge)
    const pulseAlpha = (Math.sin(this.pulseTime) + 1) * 0.15;
    if (pulseAlpha > 0.1) {
      const lastRow = Math.floor(TOTAL_BLOCKS / COLS);
      const lastCol = TOTAL_BLOCKS % COLS;
      const { sx, sy } = this.worldToScreen(this.worldX(lastCol), this.worldY(lastRow));
      if (sx > -50 && sx < w + 50 && sy > -50 && sy < h + 50) {
        const radius = 20 + pulseAlpha * 60;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * zoom);
        grad.addColorStop(0, `rgba(16,185,129,${pulseAlpha})`);
        grad.addColorStop(1, 'rgba(16,185,129,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - radius * zoom, sy - radius * zoom, radius * 2 * zoom, radius * 2 * zoom);
      }
    }

    // Coordinate labels at region+ zoom
    if (level !== 'galaxy') {
      ctx.fillStyle = 'rgba(148,163,184,0.4)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      const step = unitScreen > 20 ? 10 : unitScreen > 5 ? 50 : 200;
      for (let col = Math.ceil(colStart / step) * step; col <= colEnd; col += step) {
        const sx = (this.worldX(col) - this.camera.x) * zoom + w / 2;
        if (sx > 0 && sx < w) {
          ctx.fillText(`${col}`, sx, 12);
        }
      }
      for (let row = Math.ceil(rowStart / step) * step; row <= Math.min(rowEnd, maxRow); row += step) {
        const sy = (this.worldY(row) - this.camera.y) * zoom + h / 2;
        if (sy > 20 && sy < h) {
          ctx.fillText(`${row * COLS}`, 4, sy);
        }
      }
    }

    // === CYBERPUNK EFFECTS ===
    if (this._cyberpunk) {
      // 1. Neon rain
      ctx.save();
      for (const drop of this.rainDrops) {
        const rx = ((drop.x - this.camera.x * 0.01) % w + w) % w;
        const ry = ((drop.y) % h + h) % h;
        const grad = ctx.createLinearGradient(rx, ry, rx, ry + drop.length);
        grad.addColorStop(0, `rgba(0, 255, 200, ${drop.opacity * this.neonFlicker})`);
        grad.addColorStop(1, 'rgba(0, 255, 200, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx, ry + drop.length);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Scanlines
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1);
      }
      ctx.restore();

      // 3. Glitch displacement
      if (this.glitchSegments.length > 0) {
        for (const seg of this.glitchSegments) {
          const gy = seg.y % h;
          const imageData = ctx.getImageData(0, gy, w, seg.h);
          ctx.putImageData(imageData, seg.offset, gy);
        }
      }

      // 4. Edge neon border glow
      ctx.save();
      const edgeSize = 3;
      // Top
      const topGrad = ctx.createLinearGradient(0, 0, 0, edgeSize * 15);
      topGrad.addColorStop(0, `rgba(255, 0, 100, ${0.35 * this.neonFlicker})`);
      topGrad.addColorStop(1, 'rgba(255, 0, 100, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, w, edgeSize * 15);
      // Bottom
      const botGrad = ctx.createLinearGradient(0, h, 0, h - edgeSize * 15);
      botGrad.addColorStop(0, `rgba(0, 200, 255, ${0.3 * this.neonFlicker})`);
      botGrad.addColorStop(1, 'rgba(0, 200, 255, 0)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, h - edgeSize * 15, w, edgeSize * 15);
      // Left
      const leftGrad = ctx.createLinearGradient(0, 0, edgeSize * 10, 0);
      leftGrad.addColorStop(0, `rgba(168, 85, 247, ${0.25 * this.neonFlicker})`);
      leftGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, edgeSize * 10, h);
      // Right
      const rightGrad = ctx.createLinearGradient(w, 0, w - edgeSize * 10, 0);
      rightGrad.addColorStop(0, `rgba(247, 147, 26, ${0.25 * this.neonFlicker})`);
      rightGrad.addColorStop(1, 'rgba(247, 147, 26, 0)');
      ctx.fillStyle = rightGrad;
      ctx.fillRect(w - edgeSize * 10, 0, edgeSize * 10, h);
      ctx.restore();

      // 5. CRT vignette
      ctx.save();
      const vigGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 6. Random neon flashes (rare)
      if (Math.random() < 0.005) {
        const flashX = Math.random() * w;
        const flashY = Math.random() * h;
        const flashR = 30 + Math.random() * 80;
        const flashGrad = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, flashR);
        const flashColors = ['rgba(0,255,200,0.3)', 'rgba(255,0,100,0.3)', 'rgba(0,200,255,0.3)'];
        flashGrad.addColorStop(0, flashColors[Math.floor(Math.random() * 3)]);
        flashGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flashGrad;
        ctx.fillRect(flashX - flashR, flashY - flashR, flashR * 2, flashR * 2);
      }
    }
  }

  // Minimap rendering
  renderMinimap(miniCanvas: HTMLCanvasElement) {
    const ctx = miniCanvas.getContext('2d')!;
    const mw = miniCanvas.width;
    const mh = miniCanvas.height;
    const totalRows = Math.ceil(TOTAL_BLOCKS / COLS);

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, mw, mh);

    // Draw epoch bands
    const epochs = [
      { start: 0, end: 210000, color: '#f7931a' },
      { start: 210000, end: 420000, color: '#66ccff' },
      { start: 420000, end: 630000, color: '#a855f7' },
      { start: 630000, end: 840000, color: '#22c55e' },
      { start: 840000, end: TOTAL_BLOCKS, color: '#10b981' },
    ];
    for (const ep of epochs) {
      const y1 = (Math.floor(ep.start / COLS) / totalRows) * mh;
      const y2 = (Math.ceil(ep.end / COLS) / totalRows) * mh;
      ctx.fillStyle = ep.color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, y1, mw, y2 - y1);
    }
    ctx.globalAlpha = 1;

    // Draw viewport rect
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(w, h);
    const worldW = COLS * UNIT;
    const worldH = totalRows * UNIT;

    const rx = (tl.wx / worldW) * mw;
    const ry = (tl.wy / worldH) * mh;
    const rw = ((br.wx - tl.wx) / worldW) * mw;
    const rh = ((br.wy - tl.wy) / worldH) * mh;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      Math.max(0, rx), Math.max(0, ry),
      Math.min(mw - Math.max(0, rx), rw),
      Math.min(mh - Math.max(0, ry), rh)
    );
  }

  minimapClick(mx: number, my: number, mw: number, mh: number) {
    const totalRows = Math.ceil(TOTAL_BLOCKS / COLS);
    const worldW = COLS * UNIT;
    const worldH = totalRows * UNIT;
    this.targetCamera.x = (mx / mw) * worldW;
    this.targetCamera.y = (my / mh) * worldH;
  }
}
