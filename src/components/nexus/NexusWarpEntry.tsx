"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface Props {
  onComplete: () => void;
}

function playWarpSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.2, now);
    master.gain.linearRampToValueAtTime(0.5, now + 2.5);
    master.gain.linearRampToValueAtTime(0.6, now + 4.0);
    master.gain.exponentialRampToValueAtTime(0.01, now + 6.0);
    master.connect(ctx.destination);

    const bass = ctx.createOscillator();
    bass.type = "sawtooth";
    bass.frequency.setValueAtTime(30, now);
    bass.frequency.exponentialRampToValueAtTime(60, now + 2);
    bass.frequency.exponentialRampToValueAtTime(100, now + 4);
    bass.frequency.exponentialRampToValueAtTime(35, now + 5.5);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.3, now);
    bg.gain.linearRampToValueAtTime(0.5, now + 3.5);
    bg.gain.exponentialRampToValueAtTime(0.01, now + 6);
    bass.connect(bg).connect(master);
    bass.start(now); bass.stop(now + 6);

    const mid = ctx.createOscillator();
    mid.type = "sine";
    mid.frequency.setValueAtTime(80, now);
    mid.frequency.exponentialRampToValueAtTime(300, now + 4);
    mid.frequency.exponentialRampToValueAtTime(80, now + 5.5);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0, now);
    mg.gain.linearRampToValueAtTime(0.2, now + 2);
    mg.gain.linearRampToValueAtTime(0.35, now + 4);
    mg.gain.exponentialRampToValueAtTime(0.01, now + 6);
    mid.connect(mg).connect(master);
    mid.start(now); mid.stop(now + 6);

    setTimeout(() => ctx.close(), 7000);
  } catch { /* silent */ }
}

const COLORS = ["#ff00ff", "#00ffcc", "#f7931a", "#aa44ff", "#00aaff", "#ff6600"];

export default function NexusWarpEntry({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showText, setShowText] = useState(false);
  const [textOpacity, setTextOpacity] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const soundPlayedRef = useRef(false);

  const handleInteraction = useCallback(() => {
    if (!soundPlayedRef.current) {
      soundPlayedRef.current = true;
      playWarpSound();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Cap DPR at 2 for performance
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isMobile = window.innerWidth < 768;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    // Reduced counts for mobile
    const STAR_COUNT = isMobile ? 200 : 400;
    const BTC_COUNT = isMobile ? 6 : 12;
    const GRID_COUNT = isMobile ? 12 : 24;

    // Pre-allocate typed arrays for stars (no objects/GC)
    const sx = new Float32Array(STAR_COUNT);
    const sy = new Float32Array(STAR_COUNT);
    const sz = new Float32Array(STAR_COUNT);
    const ss = new Float32Array(STAR_COUNT); // speed
    const sc = new Uint8Array(STAR_COUNT);   // color index
    for (let i = 0; i < STAR_COUNT; i++) {
      sx[i] = (Math.random() - 0.5) * 2000;
      sy[i] = (Math.random() - 0.5) * 2000;
      sz[i] = Math.random() * 1500 + 100;
      ss[i] = Math.random() * 2 + 0.5;
      sc[i] = Math.floor(Math.random() * COLORS.length);
    }

    // ₿ symbols
    const bx = new Float32Array(BTC_COUNT);
    const by = new Float32Array(BTC_COUNT);
    const bz = new Float32Array(BTC_COUNT);
    const br = new Float32Array(BTC_COUNT); // rotation
    for (let i = 0; i < BTC_COUNT; i++) {
      bx[i] = (Math.random() - 0.5) * 1500;
      by[i] = (Math.random() - 0.5) * 1500;
      bz[i] = Math.random() * 800 + 200;
      br[i] = Math.random() * 6.28;
    }

    // Grid lines
    const gz = new Float32Array(GRID_COUNT);
    const go = new Float32Array(GRID_COUNT); // offset
    const gh = new Uint8Array(GRID_COUNT);   // horizontal flag
    const gci = new Uint8Array(GRID_COUNT);  // color index
    for (let i = 0; i < GRID_COUNT; i++) {
      gz[i] = Math.random() * 1200;
      go[i] = (Math.random() - 0.5) * 500;
      gh[i] = Math.random() > 0.5 ? 1 : 0;
      gci[i] = Math.floor(Math.random() * COLORS.length);
    }

    const startTime = performance.now();
    let animId: number;

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Speed
      let spd = 1;
      if (elapsed < 2) spd = 0.5 + elapsed * 0.4;
      else if (elapsed < 4.5) spd = 2 + ((elapsed - 2) / 2.5) * 22;
      else spd = 25;

      const isWarp = elapsed >= 2;

      // Background — simple fill (no radial gradient every frame on mobile)
      ctx.fillStyle = "#08020f";
      ctx.fillRect(0, 0, w, h);

      // Subtle purple radial glow (only center, cheap)
      if (!isMobile || elapsed < 3) {
        const r = Math.min(w, h) * 0.4;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, "rgba(40, 10, 60, 0.4)");
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      // Hexagonal tunnel rings (warp only)
      if (isWarp) {
        const ringCount = isMobile ? 8 : 14;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < ringCount; i++) {
          const rz = ((elapsed * 220 + i * 110) % 1400);
          const scale = 800 / (rz + 1);
          const alpha = Math.max(0, 0.45 - rz / 1600) * Math.min((elapsed - 2) / 1, 1);
          if (alpha < 0.03) continue;
          const ci = i % 3;
          const col = ci === 0 ? `rgba(255,0,255,${alpha})` : ci === 1 ? `rgba(0,255,204,${alpha})` : `rgba(247,147,26,${alpha})`;
          ctx.strokeStyle = col;
          ctx.beginPath();
          for (let s = 0; s <= 6; s++) {
            const a = (s / 6) * 6.283 + elapsed * 0.4;
            const rx = Math.cos(a) * scale * 1.6 + cx;
            const ry = Math.sin(a) * scale * 0.9 + cy;
            if (s === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
          }
          ctx.stroke();
        }
      }

      // Grid lines
      ctx.lineWidth = 1;
      for (let i = 0; i < GRID_COUNT; i++) {
        gz[i] -= (2 + ss[i % STAR_COUNT]) * spd;
        if (gz[i] <= 0) { gz[i] = 1200; go[i] = (Math.random() - 0.5) * 500; }
        const depth = 1 - gz[i] / 1200;
        if (depth < 0.05) continue;
        const scale = 400 / (gz[i] + 1);
        const a = Math.floor(depth * 100);
        ctx.strokeStyle = COLORS[gci[i]] + (a < 16 ? "0" : "") + a.toString(16);
        ctx.beginPath();
        if (gh[i]) {
          const y2 = go[i] * scale + cy;
          ctx.moveTo(cx - scale * 350, y2);
          ctx.lineTo(cx + scale * 350, y2);
        } else {
          const x2 = go[i] * scale + cx;
          ctx.moveTo(x2, cy - scale * 350);
          ctx.lineTo(x2, cy + scale * 350);
        }
        ctx.stroke();
      }

      // Stars — simple lines, no gradient per star, no shadowBlur
      for (let i = 0; i < STAR_COUNT; i++) {
        sz[i] -= ss[i] * spd;
        if (sz[i] <= 0) { sz[i] = 1500; sx[i] = (Math.random() - 0.5) * 2000; sy[i] = (Math.random() - 0.5) * 2000; }

        const px2 = (sx[i] / sz[i]) * 400 + cx;
        const py2 = (sy[i] / sz[i]) * 400 + cy;
        const brightness = Math.min(1, (1500 - sz[i]) / 1000);
        const size = Math.max(0.5, (1 - sz[i] / 1500) * 2.5);

        if (spd > 2) {
          // Streaks
          const pz = sz[i] + ss[i] * spd;
          const ox = (sx[i] / pz) * 400 + cx;
          const oy = (sy[i] / pz) * 400 + cy;
          const a = Math.floor(brightness * 180);
          ctx.strokeStyle = COLORS[sc[i]] + (a < 16 ? "0" : "") + a.toString(16);
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(px2, py2);
          ctx.stroke();
        } else {
          // Dots
          const a = Math.floor(brightness * 180);
          ctx.fillStyle = COLORS[sc[i]] + (a < 16 ? "0" : "") + a.toString(16);
          ctx.fillRect(px2 - size * 0.5, py2 - size * 0.5, size, size);
        }
      }

      // ₿ symbols — simple text, NO shadowBlur, NO radial gradient per symbol
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < BTC_COUNT; i++) {
        bz[i] -= 1.2 * spd * 0.3;
        br[i] += 0.015;
        if (bz[i] <= 0) { bz[i] = 800; bx[i] = (Math.random() - 0.5) * 1500; by[i] = (Math.random() - 0.5) * 1500; }

        const fx = (bx[i] / bz[i]) * 350 + cx;
        const fy = (by[i] / bz[i]) * 350 + cy;
        const bScale = Math.max(0.15, (800 - bz[i]) / 500);
        const bAlpha = bScale * 0.6;
        if (bAlpha < 0.08) continue;

        const fontSize = Math.floor(22 * bScale);
        ctx.font = `bold ${fontSize}px monospace`;
        const a = Math.min(Math.floor(bAlpha * 255), 230);
        ctx.fillStyle = `rgba(247, 147, 26, ${(a / 255).toFixed(2)})`;
        ctx.fillText("₿", fx, fy);
      }

      // Flash at peak
      if (elapsed > 4.3 && elapsed < 4.8) {
        const ft = (elapsed - 4.3) / 0.5;
        ctx.fillStyle = `rgba(0, 255, 204, ${(1 - ft) * 0.25})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Vignette (simple, not every frame on mobile)
      if (!isMobile) {
        const vg = ctx.createRadialGradient(cx, cy, h * 0.25, cx, cy, h * 0.8);
        vg.addColorStop(0, "rgba(0,0,0,0)");
        vg.addColorStop(1, "rgba(0,0,0,0.6)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
      }

      // Text + fade out
      if (elapsed > 4.6 && !showText) setShowText(true);

      if (elapsed > 5.5) {
        const fadeT = Math.min((elapsed - 5.5) / 1.0, 1);
        setOverlayOpacity(1 - fadeT);
        setTextOpacity(Math.max(1 - fadeT * 1.5, 0));
        if (fadeT >= 1) { onComplete(); return; }
      } else if (showText) {
        setTextOpacity(Math.min((elapsed - 4.6) / 0.4, 1));
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-[100] cursor-pointer"
      style={{ background: "#08020f", opacity: overlayOpacity }}
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {showText && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none" style={{ opacity: textOpacity }}>
          <div
            className="text-3xl sm:text-6xl font-black tracking-[0.2em] mb-3"
            style={{
              background: "linear-gradient(135deg, #ff00ff 0%, #00ffcc 35%, #f7931a 65%, #aa44ff 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(255,0,255,0.3))",
            }}
          >
            THE NEXUS
          </div>
          <div
            className="text-xs sm:text-base font-mono tracking-[0.3em] uppercase"
            style={{ color: "rgba(0,255,204,0.8)", textShadow: "0 0 15px rgba(0,255,204,0.3)" }}
          >
            ⚡ Entering Bitcoin Space ⚡
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <div
          className="text-[10px] font-mono tracking-wider"
          style={{ color: "rgba(255,255,255,0.2)" }}
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
        >
          tap for sound · skip
        </div>
      </div>
    </div>
  );
}
