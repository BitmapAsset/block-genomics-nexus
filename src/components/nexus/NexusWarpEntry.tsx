"use client";

import { useRef, useEffect, useState, useCallback } from "react";

/**
 * NexusWarpEntry — Cyberpunk neon warp tunnel into The Nexus
 * Bitcoin symbols, circuit grid lines, neon colors, deep space depth.
 * Pure canvas + Web Audio API. Zero external assets.
 */

interface Props {
  onComplete: () => void;
}

function playWarpSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.25, now);
    master.gain.linearRampToValueAtTime(0.55, now + 2.5);
    master.gain.linearRampToValueAtTime(0.7, now + 4.0);
    master.gain.exponentialRampToValueAtTime(0.01, now + 6.5);
    master.connect(ctx.destination);

    // Deep bass rumble
    const bass = ctx.createOscillator();
    bass.type = "sawtooth";
    bass.frequency.setValueAtTime(28, now);
    bass.frequency.exponentialRampToValueAtTime(55, now + 2.0);
    bass.frequency.exponentialRampToValueAtTime(110, now + 4.0);
    bass.frequency.exponentialRampToValueAtTime(35, now + 6.0);
    const bassGain = ctx.createGain();
    bassGain.gain.setValueAtTime(0.35, now);
    bassGain.gain.linearRampToValueAtTime(0.6, now + 3.5);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 6.5);
    bass.connect(bassGain).connect(master);
    bass.start(now);
    bass.stop(now + 6.5);

    // Mid tension
    const mid = ctx.createOscillator();
    mid.type = "sine";
    mid.frequency.setValueAtTime(75, now);
    mid.frequency.exponentialRampToValueAtTime(180, now + 3.5);
    mid.frequency.exponentialRampToValueAtTime(350, now + 4.5);
    mid.frequency.exponentialRampToValueAtTime(90, now + 6.0);
    const midGain = ctx.createGain();
    midGain.gain.setValueAtTime(0, now);
    midGain.gain.linearRampToValueAtTime(0.25, now + 1.5);
    midGain.gain.linearRampToValueAtTime(0.4, now + 4.0);
    midGain.gain.exponentialRampToValueAtTime(0.01, now + 6.5);
    mid.connect(midGain).connect(master);
    mid.start(now);
    mid.stop(now + 6.5);

    // Arrival shimmer
    const high = ctx.createOscillator();
    high.type = "sine";
    high.frequency.setValueAtTime(700, now + 3.8);
    high.frequency.exponentialRampToValueAtTime(1800, now + 4.8);
    high.frequency.exponentialRampToValueAtTime(500, now + 6.0);
    const highGain = ctx.createGain();
    highGain.gain.setValueAtTime(0, now);
    highGain.gain.setValueAtTime(0, now + 3.8);
    highGain.gain.linearRampToValueAtTime(0.12, now + 4.5);
    highGain.gain.exponentialRampToValueAtTime(0.01, now + 6.5);
    high.connect(highGain).connect(master);
    high.start(now + 3.8);
    high.stop(now + 6.5);

    // Noise burst at peak
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.setValueAtTime(0, now + 4.0);
    noiseGain.gain.linearRampToValueAtTime(0.2, now + 4.4);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 5.8);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(800, now + 4.0);
    noiseFilter.frequency.linearRampToValueAtTime(3500, now + 4.4);
    noiseFilter.Q.value = 0.6;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start(now + 4.0);
    noise.stop(now + 5.8);

    setTimeout(() => ctx.close(), 8000);
  } catch { /* silent */ }
}

interface Star {
  x: number; y: number; z: number; speed: number; color: string; size: number;
}

interface GridLine {
  z: number; speed: number; horizontal: boolean; offset: number; color: string;
}

interface BitcoinSymbol {
  x: number; y: number; z: number; rotation: number; rotSpeed: number; size: number; alpha: number;
}

interface CircuitNode {
  x: number; y: number; pulseOffset: number; connections: number[];
}

export default function NexusWarpEntry({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"gathering" | "warp" | "burst">("gathering");
  const [showText, setShowText] = useState(false);
  const [textOpacity, setTextOpacity] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const startTimeRef = useRef(0);
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;
    const CX = () => W() / 2;
    const CY = () => H() / 2;

    // Neon star particles
    const neonColors = ["#ff00ff", "#00ffcc", "#f7931a", "#aa44ff", "#00aaff", "#ff6600", "#ff0066", "#66ff00"];
    const stars: Star[] = [];
    for (let i = 0; i < 500; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2500,
        y: (Math.random() - 0.5) * 2500,
        z: Math.random() * 1500 + 100,
        speed: Math.random() * 2 + 0.5,
        color: neonColors[Math.floor(Math.random() * neonColors.length)],
        size: Math.random() * 1.5 + 0.5,
      });
    }

    // Grid lines rushing toward camera
    const gridLines: GridLine[] = [];
    for (let i = 0; i < 30; i++) {
      gridLines.push({
        z: Math.random() * 1200,
        speed: Math.random() * 3 + 2,
        horizontal: Math.random() > 0.5,
        offset: (Math.random() - 0.5) * 600,
        color: neonColors[Math.floor(Math.random() * neonColors.length)],
      });
    }

    // Floating ₿ symbols
    const btcSymbols: BitcoinSymbol[] = [];
    for (let i = 0; i < 15; i++) {
      btcSymbols.push({
        x: (Math.random() - 0.5) * 1800,
        y: (Math.random() - 0.5) * 1800,
        z: Math.random() * 1000 + 300,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        size: Math.random() * 20 + 15,
        alpha: Math.random() * 0.4 + 0.3,
      });
    }

    // Circuit board nodes
    const circuitNodes: CircuitNode[] = [];
    for (let i = 0; i < 40; i++) {
      circuitNodes.push({
        x: (Math.random() - 0.5) * W() * 1.5 + CX(),
        y: (Math.random() - 0.5) * H() * 1.5 + CY(),
        pulseOffset: Math.random() * Math.PI * 2,
        connections: [],
      });
    }
    // Connect nearby nodes
    for (let i = 0; i < circuitNodes.length; i++) {
      for (let j = i + 1; j < circuitNodes.length; j++) {
        const dx = circuitNodes[i].x - circuitNodes[j].x;
        const dy = circuitNodes[i].y - circuitNodes[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < 200) {
          circuitNodes[i].connections.push(j);
        }
      }
    }

    // Data fragments
    const dataTexts = [
      "#720143", "₿", "21M", "NEXUS", "GENOME", "BLOCK", "SHA-256",
      "VERIFY", "BITMAP", "PROOF", "CHAIN", "HASH", "2.1km", "SAT",
      "EPOCH", "NODE", "MINE", "TRUST", "DNA", "TX",
    ];

    startTimeRef.current = performance.now();
    let animId: number;

    const animate = () => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      const w = W();
      const h = H();
      const cx = CX();
      const cy = CY();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Phase
      let currentPhase: string;
      if (elapsed < 2.2) currentPhase = "gathering";
      else if (elapsed < 4.8) currentPhase = "warp";
      else currentPhase = "burst";

      // Speed
      let speedMult = 1;
      if (currentPhase === "gathering") {
        speedMult = 0.4 + elapsed * 0.4;
      } else if (currentPhase === "warp") {
        const wt = (elapsed - 2.2) / 2.6;
        speedMult = 2 + wt * 20;
      } else {
        speedMult = 25;
      }

      // Background — deep space gradient (not plain black)
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
      bgGrad.addColorStop(0, "rgba(15, 5, 30, 0.2)");
      bgGrad.addColorStop(0.4, "rgba(8, 2, 20, 0.2)");
      bgGrad.addColorStop(1, "rgba(2, 1, 8, 0.25)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Circuit board background (gathering phase)
      if (currentPhase === "gathering") {
        const circAlpha = Math.min(elapsed / 2, 0.3);
        ctx.strokeStyle = `rgba(100, 50, 200, ${circAlpha * 0.3})`;
        ctx.lineWidth = 0.5;
        for (const node of circuitNodes) {
          const pulse = Math.sin(elapsed * 2 + node.pulseOffset) * 0.5 + 0.5;
          // Draw node
          ctx.fillStyle = `rgba(170, 68, 255, ${circAlpha * pulse})`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
          ctx.fill();
          // Draw connections
          for (const ci of node.connections) {
            const other = circuitNodes[ci];
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            // Right-angle circuit paths
            ctx.lineTo(other.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }
      }

      // Neon tunnel rings
      if (currentPhase === "warp" || currentPhase === "burst") {
        const warpT = Math.min((elapsed - 2.2) / 2.6, 1);
        const numRings = 16;
        for (let i = 0; i < numRings; i++) {
          const ringZ = ((elapsed * 250 + i * 100) % 1500);
          const scale = 900 / (ringZ + 1);
          const alpha = Math.max(0, 0.5 - ringZ / 1800) * warpT;
          const ringColor = i % 3 === 0 ? "255,0,255" : i % 3 === 1 ? "0,255,204" : "247,147,26";
          ctx.strokeStyle = `rgba(${ringColor}, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Hexagonal rings for cyber feel
          const sides = 6;
          for (let s = 0; s <= sides; s++) {
            const angle = (s / sides) * Math.PI * 2 + elapsed * 0.5;
            const rx = Math.cos(angle) * scale * 1.8 + cx;
            const ry = Math.sin(angle) * scale * 1.0 + cy;
            if (s === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          }
          ctx.stroke();
        }
      }

      // Grid lines rushing past
      for (const line of gridLines) {
        line.z -= line.speed * speedMult;
        if (line.z <= 0) {
          line.z = 1200;
          line.offset = (Math.random() - 0.5) * 600;
        }
        const depth = 1 - line.z / 1200;
        const alpha = depth * 0.4;
        if (alpha < 0.02) continue;

        const scale = 500 / (line.z + 1);
        ctx.strokeStyle = line.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.lineWidth = depth * 2;
        ctx.beginPath();
        if (line.horizontal) {
          const y = line.offset * scale + cy;
          ctx.moveTo(cx - scale * 400, y);
          ctx.lineTo(cx + scale * 400, y);
        } else {
          const x = line.offset * scale + cx;
          ctx.moveTo(x, cy - scale * 400);
          ctx.lineTo(x, cy + scale * 400);
        }
        ctx.stroke();
      }

      // Stars
      for (const star of stars) {
        star.z -= star.speed * speedMult;
        if (star.z <= 0) {
          star.z = 1500;
          star.x = (Math.random() - 0.5) * 2500;
          star.y = (Math.random() - 0.5) * 2500;
        }
        const sx = (star.x / star.z) * 400 + cx;
        const sy = (star.y / star.z) * 400 + cy;
        const prevZ = star.z + star.speed * speedMult;
        const px = (star.x / prevZ) * 400 + cx;
        const py = (star.y / prevZ) * 400 + cy;
        const brightness = Math.min(1, (1500 - star.z) / 1000);
        const size = Math.max(0.5, (1 - star.z / 1500) * 3) * star.size;
        const trailLen = speedMult * 2;

        if (trailLen > 3) {
          const grad = ctx.createLinearGradient(px, py, sx, sy);
          grad.addColorStop(0, "rgba(255,255,255,0)");
          const hexAlpha = Math.floor(brightness * 220).toString(16).padStart(2, "0");
          grad.addColorStop(1, star.color + hexAlpha);
          ctx.strokeStyle = grad;
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        } else {
          // Glow dot
          ctx.shadowColor = star.color;
          ctx.shadowBlur = size * 4;
          ctx.fillStyle = star.color + Math.floor(brightness * 200).toString(16).padStart(2, "0");
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // ₿ Symbols floating
      for (const btc of btcSymbols) {
        btc.z -= 1.5 * speedMult * 0.3;
        btc.rotation += btc.rotSpeed;
        if (btc.z <= 0) {
          btc.z = 1000;
          btc.x = (Math.random() - 0.5) * 1800;
          btc.y = (Math.random() - 0.5) * 1800;
        }
        const bx = (btc.x / btc.z) * 400 + cx;
        const by = (btc.y / btc.z) * 400 + cy;
        const bScale = Math.max(0.2, (1000 - btc.z) / 500);
        const bAlpha = btc.alpha * bScale;
        if (bAlpha < 0.05) continue;

        const fontSize = btc.size * bScale;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(btc.rotation);

        // Glow circle behind ₿
        const glowR = fontSize * 1.2;
        const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
        glowGrad.addColorStop(0, `rgba(247, 147, 26, ${bAlpha * 0.4})`);
        glowGrad.addColorStop(0.6, `rgba(247, 147, 26, ${bAlpha * 0.15})`);
        glowGrad.addColorStop(1, "rgba(247, 147, 26, 0)");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(-glowR, -glowR, glowR * 2, glowR * 2);

        // ₿ symbol
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(247, 147, 26, ${Math.min(bAlpha, 0.9)})`;
        ctx.shadowColor = "#f7931a";
        ctx.shadowBlur = fontSize * 0.5;
        ctx.fillText("₿", 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Data text fragments
      if (currentPhase !== "burst") {
        const fragCount = 8;
        for (let i = 0; i < fragCount; i++) {
          const seed = i * 137.5 + elapsed * 50;
          const fz = ((seed * 3) % 800) + 50;
          const fx = (Math.sin(seed * 0.1) * 600 / fz) * 300 + cx;
          const fy = (Math.cos(seed * 0.13) * 600 / fz) * 300 + cy;
          const fScale = Math.max(0.2, (800 - fz) / 400);
          const fAlpha = fScale * 0.5;
          if (fAlpha > 0.05) {
            ctx.font = `${Math.floor(11 * fScale)}px monospace`;
            ctx.fillStyle = `rgba(0, 255, 204, ${Math.min(fAlpha, 0.6)})`;
            ctx.fillText(dataTexts[i % dataTexts.length], fx, fy);
          }
        }
      }

      // Center energy core (gathering)
      if (currentPhase === "gathering") {
        const coreSize = 20 + elapsed * 25;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
        coreGrad.addColorStop(0, "rgba(255, 0, 255, 0.15)");
        coreGrad.addColorStop(0.3, "rgba(0, 255, 204, 0.08)");
        coreGrad.addColorStop(0.6, "rgba(170, 68, 255, 0.04)");
        coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = coreGrad;
        ctx.fillRect(cx - coreSize, cy - coreSize, coreSize * 2, coreSize * 2);
      }

      // Flash at warp peak
      if (currentPhase === "burst" && elapsed < 5.3) {
        const flashT = (elapsed - 4.8) / 0.5;
        if (flashT > 0 && flashT < 1) {
          const flashAlpha = (1 - flashT) * 0.3;
          ctx.fillStyle = `rgba(0, 255, 204, ${flashAlpha})`;
          ctx.fillRect(0, 0, w, h);
        }
      }

      // Vignette
      const vigGrad = ctx.createRadialGradient(cx, cy, h * 0.25, cx, cy, h * 0.85);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      // Text trigger
      if (currentPhase === "burst" && elapsed > 4.9 && !showText) {
        setShowText(true);
      }

      // Fade out
      if (elapsed > 6.0) {
        const fadeT = Math.min((elapsed - 6.0) / 1.2, 1);
        setOverlayOpacity(1 - fadeT);
        setTextOpacity(Math.max(1 - fadeT * 1.5, 0));
        if (fadeT >= 1) {
          onComplete();
          return;
        }
      } else if (showText && elapsed <= 6.0) {
        const fadeInT = Math.min((elapsed - 4.9) / 0.5, 1);
        setTextOpacity(fadeInT);
      }

      setPhase(currentPhase as any);
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-[100] cursor-pointer"
      style={{ background: "#050210", opacity: overlayOpacity }}
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {showText && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
          style={{ opacity: textOpacity }}
        >
          <div
            className="text-4xl sm:text-7xl font-black tracking-[0.25em] mb-4"
            style={{
              background: "linear-gradient(135deg, #ff00ff 0%, #00ffcc 30%, #f7931a 60%, #aa44ff 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 40px rgba(255,0,255,0.4)) drop-shadow(0 0 80px rgba(0,255,204,0.2))",
            }}
          >
            THE NEXUS
          </div>
          <div
            className="text-sm sm:text-lg font-mono tracking-[0.4em] uppercase"
            style={{
              color: "rgba(0,255,204,0.8)",
              textShadow: "0 0 20px rgba(0,255,204,0.4), 0 0 40px rgba(255,0,255,0.2)",
            }}
          >
            ⚡ Entering Bitcoin Space ⚡
          </div>
        </div>
      )}

      {phase !== "burst" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div
            className="text-xs font-mono tracking-wider cursor-pointer hover:opacity-100 transition-opacity"
            style={{ color: "rgba(255,255,255,0.25)" }}
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
          >
            tap to enable sound · ESC to skip
          </div>
        </div>
      )}
    </div>
  );
}
