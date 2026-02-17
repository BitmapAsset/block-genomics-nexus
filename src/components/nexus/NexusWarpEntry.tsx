"use client";

import { useRef, useEffect, useState, useCallback } from "react";

/**
 * NexusWarpEntry — Cinematic warp tunnel entry into The Nexus
 * Pure canvas + Web Audio API. Zero external assets.
 * Plays once per session, then reveals the map.
 */

interface Props {
  onComplete: () => void;
}

// Synthesize warp sound using Web Audio API
function playWarpSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Master gain
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.3, now);
    master.gain.linearRampToValueAtTime(0.6, now + 2.5);
    master.gain.linearRampToValueAtTime(0.8, now + 4.0);
    master.gain.exponentialRampToValueAtTime(0.01, now + 6.0);
    master.connect(ctx.destination);

    // Low rumble — building bass
    const bass = ctx.createOscillator();
    bass.type = "sawtooth";
    bass.frequency.setValueAtTime(30, now);
    bass.frequency.exponentialRampToValueAtTime(60, now + 2.0);
    bass.frequency.exponentialRampToValueAtTime(120, now + 4.0);
    bass.frequency.exponentialRampToValueAtTime(40, now + 5.5);
    const bassGain = ctx.createGain();
    bassGain.gain.setValueAtTime(0.4, now);
    bassGain.gain.linearRampToValueAtTime(0.7, now + 3.5);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 6.0);
    bass.connect(bassGain).connect(master);
    bass.start(now);
    bass.stop(now + 6.0);

    // Mid drone — tension
    const mid = ctx.createOscillator();
    mid.type = "sine";
    mid.frequency.setValueAtTime(80, now);
    mid.frequency.exponentialRampToValueAtTime(200, now + 3.5);
    mid.frequency.exponentialRampToValueAtTime(400, now + 4.2);
    mid.frequency.exponentialRampToValueAtTime(100, now + 5.5);
    const midGain = ctx.createGain();
    midGain.gain.setValueAtTime(0, now);
    midGain.gain.linearRampToValueAtTime(0.3, now + 1.5);
    midGain.gain.linearRampToValueAtTime(0.5, now + 4.0);
    midGain.gain.exponentialRampToValueAtTime(0.01, now + 6.0);
    mid.connect(midGain).connect(master);
    mid.start(now);
    mid.stop(now + 6.0);

    // High shimmer — the "arrival"
    const high = ctx.createOscillator();
    high.type = "sine";
    high.frequency.setValueAtTime(800, now + 3.5);
    high.frequency.exponentialRampToValueAtTime(2000, now + 4.5);
    high.frequency.exponentialRampToValueAtTime(600, now + 5.5);
    const highGain = ctx.createGain();
    highGain.gain.setValueAtTime(0, now);
    highGain.gain.setValueAtTime(0, now + 3.5);
    highGain.gain.linearRampToValueAtTime(0.15, now + 4.2);
    highGain.gain.exponentialRampToValueAtTime(0.01, now + 6.0);
    high.connect(highGain).connect(master);
    high.start(now + 3.5);
    high.stop(now + 6.0);

    // Noise burst at warp peak
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.setValueAtTime(0, now + 3.8);
    noiseGain.gain.linearRampToValueAtTime(0.25, now + 4.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 5.5);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1000, now + 3.8);
    noiseFilter.frequency.linearRampToValueAtTime(4000, now + 4.2);
    noiseFilter.Q.value = 0.5;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start(now + 3.8);
    noise.stop(now + 5.5);

    // Cleanup
    setTimeout(() => ctx.close(), 7000);
  } catch {
    // Audio not available — continue silently
  }
}

interface Star {
  x: number;
  y: number;
  z: number;
  speed: number;
  color: string;
}

interface DataFragment {
  x: number;
  y: number;
  z: number;
  text: string;
  alpha: number;
  speed: number;
}

export default function NexusWarpEntry({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"gathering" | "warp" | "burst" | "done">("gathering");
  const [showText, setShowText] = useState(false);
  const [textOpacity, setTextOpacity] = useState(0);
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

    // Hi-DPI
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;
    const CX = () => W() / 2;
    const CY = () => H() / 2;

    // Stars
    const stars: Star[] = [];
    const starColors = ["#ff8800", "#00ffcc", "#aa44ff", "#66ccff", "#ffffff", "#f7931a"];
    for (let i = 0; i < 600; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        z: Math.random() * 1500 + 100,
        speed: Math.random() * 2 + 0.5,
        color: starColors[Math.floor(Math.random() * starColors.length)],
      });
    }

    // Bitcoin data fragments
    const blockTexts = [
      "#720143", "#000000", "#840000", "#100000", "#500000",
      "₿", "21M", "2.1km", "GENOME", "VERIFY",
      "BITMAP", "NEXUS", "BLOCK", "TX", "SAT",
      "SHA-256", "HASH", "PROOF", "CHAIN", "NODE",
    ];
    const fragments: DataFragment[] = [];
    for (let i = 0; i < 40; i++) {
      fragments.push({
        x: (Math.random() - 0.5) * 1200,
        y: (Math.random() - 0.5) * 1200,
        z: Math.random() * 800 + 200,
        text: blockTexts[Math.floor(Math.random() * blockTexts.length)],
        alpha: Math.random() * 0.5 + 0.2,
        speed: Math.random() * 3 + 1,
      });
    }

    startTimeRef.current = performance.now();
    let animId: number;
    let currentPhase = "gathering";

    const animate = () => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      const w = W();
      const h = H();
      const cx = CX();
      const cy = CY();

      // Reset transform for clearing
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Phase transitions
      if (elapsed < 2.0) {
        currentPhase = "gathering";
      } else if (elapsed < 4.5) {
        currentPhase = "warp";
      } else if (elapsed < 5.5) {
        currentPhase = "burst";
      } else {
        currentPhase = "done";
      }

      // Speed multiplier based on phase
      let speedMult = 1;
      if (currentPhase === "gathering") {
        speedMult = 0.5 + elapsed * 0.5; // Slowly accelerating
      } else if (currentPhase === "warp") {
        const warpT = (elapsed - 2.0) / 2.5;
        speedMult = 2 + warpT * 25; // Exponential acceleration
      } else if (currentPhase === "burst") {
        speedMult = 30;
      }

      // Background
      if (currentPhase === "burst") {
        const burstT = (elapsed - 4.5) / 1.0;
        const brightness = Math.min(burstT * 255, 255);
        ctx.fillStyle = `rgb(${brightness * 0.1}, ${brightness * 0.9}, ${brightness * 0.7})`;
      } else {
        ctx.fillStyle = "rgba(5, 5, 10, 0.15)";
      }
      ctx.fillRect(0, 0, w, h);

      // Tunnel rings during warp
      if (currentPhase === "warp" || currentPhase === "burst") {
        const warpT = Math.min((elapsed - 2.0) / 2.5, 1);
        const numRings = 12;
        for (let i = 0; i < numRings; i++) {
          const ringZ = ((elapsed * 200 + i * 120) % 1500);
          const scale = 800 / (ringZ + 1);
          const alpha = Math.max(0, 0.4 - ringZ / 2000) * warpT;
          ctx.strokeStyle = `rgba(0, 255, 204, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, scale * 1.5, scale, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Stars — streaking toward camera
      for (const star of stars) {
        star.z -= star.speed * speedMult;
        if (star.z <= 0) {
          star.z = 1500;
          star.x = (Math.random() - 0.5) * 2000;
          star.y = (Math.random() - 0.5) * 2000;
        }

        const sx = (star.x / star.z) * 400 + cx;
        const sy = (star.y / star.z) * 400 + cy;

        // Trail length based on speed
        const trailLen = Math.min(speedMult * 2, 60);
        const prevZ = star.z + star.speed * speedMult;
        const px = (star.x / prevZ) * 400 + cx;
        const py = (star.y / prevZ) * 400 + cy;

        const brightness = Math.min(1, (1500 - star.z) / 1000);
        const size = Math.max(0.5, (1 - star.z / 1500) * 3);

        if (trailLen > 3) {
          // Draw streak
          const grad = ctx.createLinearGradient(px, py, sx, sy);
          grad.addColorStop(0, `rgba(255,255,255,0)`);
          grad.addColorStop(1, star.color + Math.floor(brightness * 200).toString(16).padStart(2, "0"));
          ctx.strokeStyle = grad;
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        } else {
          ctx.fillStyle = star.color + Math.floor(brightness * 200).toString(16).padStart(2, "0");
          ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        }
      }

      // Data fragments
      for (const frag of fragments) {
        frag.z -= frag.speed * speedMult * 0.5;
        if (frag.z <= 0) {
          frag.z = 800;
          frag.x = (Math.random() - 0.5) * 1200;
          frag.y = (Math.random() - 0.5) * 1200;
        }

        const fx = (frag.x / frag.z) * 300 + cx;
        const fy = (frag.y / frag.z) * 300 + cy;
        const fScale = Math.max(0.3, (800 - frag.z) / 400);
        const fAlpha = frag.alpha * fScale * (currentPhase === "burst" ? 0 : 1);

        if (fAlpha > 0.05) {
          ctx.font = `${Math.floor(10 * fScale)}px monospace`;
          ctx.fillStyle = `rgba(0, 255, 204, ${Math.min(fAlpha, 0.8)})`;
          ctx.fillText(frag.text, fx, fy);
        }
      }

      // Center glow during gathering
      if (currentPhase === "gathering") {
        const glowSize = 30 + elapsed * 20;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
        grad.addColorStop(0, "rgba(0, 255, 204, 0.15)");
        grad.addColorStop(0.5, "rgba(170, 68, 255, 0.05)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(cx - glowSize, cy - glowSize, glowSize * 2, glowSize * 2);
      }

      // Vignette
      const vigGrad = ctx.createRadialGradient(cx, cy, h * 0.3, cx, cy, h * 0.8);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      // Phase updates
      if (currentPhase === "burst" && elapsed > 4.8 && !showText) {
        setShowText(true);
      }

      if (currentPhase === "done") {
        setPhase("done");
        return; // Stop animation
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

  // Text fade in and auto-complete
  useEffect(() => {
    if (showText) {
      const fadeIn = setInterval(() => {
        setTextOpacity((prev) => {
          if (prev >= 1) {
            clearInterval(fadeIn);
            return 1;
          }
          return prev + 0.05;
        });
      }, 30);

      const complete = setTimeout(() => {
        onComplete();
      }, 1800);

      return () => {
        clearInterval(fadeIn);
        clearTimeout(complete);
      };
    }
  }, [showText, onComplete]);

  return (
    <div
      className="fixed inset-0 z-[100] cursor-pointer"
      style={{ background: "#050510" }}
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* "ENTERING THE NEXUS" text */}
      {showText && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
          style={{ opacity: textOpacity }}
        >
          <div
            className="text-4xl sm:text-6xl font-black tracking-[0.2em] mb-4"
            style={{
              background: "linear-gradient(135deg, #00ffcc 0%, #ffffff 40%, #aa44ff 70%, #ff8800 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(0,255,204,0.5))",
              textShadow: "0 0 60px rgba(0,255,204,0.3)",
            }}
          >
            THE NEXUS
          </div>
          <div
            className="text-sm sm:text-base font-mono tracking-[0.3em] uppercase"
            style={{
              color: "rgba(0,255,204,0.7)",
              textShadow: "0 0 20px rgba(0,255,204,0.3)",
            }}
          >
            ⚡ Entering Bitcoin Space ⚡
          </div>
        </div>
      )}

      {/* Skip hint */}
      {phase !== "done" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div
            className="text-xs font-mono tracking-wider cursor-pointer hover:opacity-100 transition-opacity"
            style={{ color: "rgba(255,255,255,0.3)" }}
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
          >
            click anywhere to enable sound · ESC to skip
          </div>
        </div>
      )}
    </div>
  );
}
