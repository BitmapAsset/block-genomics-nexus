'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ── TUNING ─────────────────────────────────────────────── */
const REVEAL_TIME = 3.43;
const PHASE_CONVERGE_END = 1.5;
const PHASE_VERIFY_END = 2.8;
const PHASE_BURST_END = REVEAL_TIME;

const BUBBLE_COUNT = 28;
const BURST_COUNT = 36;
const PARTICLE_COUNT = 300;
const AMBIENT_SPEED = 0.0015;

/* ── TEXTURE HELPERS ────────────────────────────────────── */
function makeEmojiTexture(emoji: string, glowColor: string, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size * 0.48);
  grad.addColorStop(0, glowColor + '55');
  grad.addColorStop(0.6, glowColor + '22');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = glowColor + '88';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = `${size * 0.48}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.02);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * 🛡️👑 Crown Shield Badge — Block Genomics
 *
 * A2 Crown Shield design (finalized 2026-02-10):
 * - 3-point crown on top with jewel dots
 * - Rounded heraldic shield body (dark gradient)
 * - ₿ symbol center (gold)
 * - Green ✓ checkmark (verified)
 * - Tiers: Gold (Tier 1), Cyan (Tier 2), Purple (Tier 3)
 */
function makeShieldTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const s = size / 512;

  const primary = '#f7931a';
  const secondary = '#ffcc44';
  const checkGreen = '#22c55e';

  // ── Outer glow ──
  const outerGlow = ctx.createRadialGradient(cx, cy, size * 0.15, cx, cy, size * 0.48);
  outerGlow.addColorStop(0, 'rgba(247, 147, 26, 0.3)');
  outerGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = outerGlow;
  ctx.fillRect(0, 0, size, size);

  // ── Crown (3-point) ──
  const crownY = cy - 170 * s;
  const crownW = 130 * s;
  const crownH = 80 * s;
  const crownBaseY = crownY + crownH;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - crownW * 0.5, crownBaseY);
  ctx.lineTo(cx - crownW * 0.4, crownY + 10 * s);   // left tip
  ctx.lineTo(cx - crownW * 0.15, crownBaseY - 20 * s); // left valley
  ctx.lineTo(cx, crownY);                               // center tip (tallest)
  ctx.lineTo(cx + crownW * 0.15, crownBaseY - 20 * s); // right valley
  ctx.lineTo(cx + crownW * 0.4, crownY + 10 * s);    // right tip
  ctx.lineTo(cx + crownW * 0.5, crownBaseY);
  ctx.closePath();

  const crownGrad = ctx.createLinearGradient(cx - crownW * 0.5, crownY, cx + crownW * 0.5, crownBaseY);
  crownGrad.addColorStop(0, secondary);
  crownGrad.addColorStop(1, primary);
  ctx.fillStyle = crownGrad;
  ctx.fill();
  ctx.restore();

  // Crown jewels (3 dots)
  [
    { x: cx - crownW * 0.4, y: crownY + 10 * s, r: 7 * s },
    { x: cx, y: crownY, r: 8 * s },
    { x: cx + crownW * 0.4, y: crownY + 10 * s, r: 7 * s },
  ].forEach(({ x, y, r }) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = secondary;
    ctx.fill();
    // jewel glow
    const jg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    jg.addColorStop(0, 'rgba(255, 204, 68, 0.4)');
    jg.addColorStop(1, 'transparent');
    ctx.fillStyle = jg;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Shield path (rounded heraldic) ──
  function drawShieldPath() {
    const top = crownBaseY - 5 * s;
    const w = 150 * s;
    const bottom = cy + 180 * s;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx + 50 * s, top, cx + w, top + 20 * s, cx + w, top + 40 * s);
    ctx.lineTo(cx + w, cy + 20 * s);
    ctx.bezierCurveTo(cx + w - 5 * s, cy + 80 * s, cx + 100 * s, cy + 130 * s, cx, bottom);
    ctx.bezierCurveTo(cx - 100 * s, cy + 130 * s, cx - w + 5 * s, cy + 80 * s, cx - w, cy + 20 * s);
    ctx.lineTo(cx - w, top + 40 * s);
    ctx.bezierCurveTo(cx - w, top + 20 * s, cx - 50 * s, top, cx, top);
    ctx.closePath();
  }

  // Shield fill
  ctx.save();
  drawShieldPath();
  const shieldGrad = ctx.createLinearGradient(cx, crownBaseY, cx, cy + 180 * s);
  shieldGrad.addColorStop(0, '#1a1a2e');
  shieldGrad.addColorStop(0.5, '#12121a');
  shieldGrad.addColorStop(1, '#0a0a14');
  ctx.fillStyle = shieldGrad;
  ctx.fill();
  ctx.restore();

  // Shield border (gold)
  ctx.save();
  drawShieldPath();
  const borderGrad = ctx.createLinearGradient(cx - 150 * s, cy, cx + 150 * s, cy);
  borderGrad.addColorStop(0, secondary);
  borderGrad.addColorStop(0.5, primary);
  borderGrad.addColorStop(1, secondary);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 5 * s;
  ctx.stroke();
  ctx.restore();

  // Inner border (thin)
  ctx.save();
  ctx.translate(cx * 0.06, cy * 0.06);
  ctx.scale(0.94, 0.94);
  drawShieldPath();
  ctx.strokeStyle = `rgba(247, 147, 26, 0.2)`;
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.restore();

  // Inner glow
  ctx.save();
  drawShieldPath();
  ctx.clip();
  const innerGlow = ctx.createRadialGradient(cx, cy + 20 * s, 0, cx, cy + 20 * s, 120 * s);
  innerGlow.addColorStop(0, 'rgba(247, 147, 26, 0.12)');
  innerGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = innerGlow;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // ── Central ₿ symbol ──
  ctx.save();
  drawShieldPath();
  ctx.clip();

  const btcGlow = ctx.createRadialGradient(cx, cy + 20 * s, 0, cx, cy + 20 * s, 60 * s);
  btcGlow.addColorStop(0, 'rgba(247, 147, 26, 0.3)');
  btcGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = btcGlow;
  ctx.beginPath();
  ctx.arc(cx, cy + 20 * s, 60 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `bold ${90 * s}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const btcGrad = ctx.createLinearGradient(cx, cy - 25 * s, cx, cy + 65 * s);
  btcGrad.addColorStop(0, secondary);
  btcGrad.addColorStop(0.5, '#ffffff');
  btcGrad.addColorStop(1, primary);
  ctx.fillStyle = btcGrad;
  ctx.fillText('₿', cx, cy + 22 * s);
  ctx.strokeStyle = 'rgba(247, 147, 26, 0.3)';
  ctx.lineWidth = 1.5 * s;
  ctx.strokeText('₿', cx, cy + 22 * s);
  ctx.restore();

  // ── Green ✓ checkmark (bottom of shield, matching A2 design) ──
  ctx.save();
  drawShieldPath();
  ctx.clip();
  const checkCY = cy + 130 * s;
  ctx.beginPath();
  ctx.moveTo(cx - 18 * s, checkCY);
  ctx.lineTo(cx - 6 * s, checkCY + 15 * s);
  ctx.lineTo(cx + 24 * s, checkCY - 12 * s);
  ctx.strokeStyle = '#22ff88';
  ctx.lineWidth = 5 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // check glow
  const cg = ctx.createRadialGradient(cx, checkCY, 0, cx, checkCY, 30 * s);
  cg.addColorStop(0, 'rgba(34, 255, 136, 0.25)');
  cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, checkCY, 30 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // (No BG monogram — removed per Gravity's finalized A2 design)

  // ── Corner accents (tiny diamonds) ──
  ctx.save();
  drawShieldPath();
  ctx.clip();
  const diamonds = [
    { x: cx - 110 * s, y: cy - 40 * s },
    { x: cx + 110 * s, y: cy - 40 * s },
    { x: cx - 90 * s, y: cy + 60 * s },
    { x: cx + 90 * s, y: cy + 60 * s },
  ];
  diamonds.forEach(({ x, y }) => {
    ctx.beginPath();
    ctx.moveTo(x, y - 5 * s);
    ctx.lineTo(x + 4 * s, y);
    ctx.lineTo(x, y + 5 * s);
    ctx.lineTo(x - 4 * s, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 210, 125, 0.4)';
    ctx.fill();
  });
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ── DATA TYPES ─────────────────────────────────────────── */
interface BubbleData {
  origin: THREE.Vector3;
  type: 'bot' | 'boy' | 'girl';
  delay: number;
  speed: number;
  wobble: number;
}

interface BurstData {
  dir: THREE.Vector3;
  speed: number;
  rotSpeed: number;
}

function generateBubbles(): BubbleData[] {
  const bubbles: BubbleData[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const theta = (i / BUBBLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 12 + Math.random() * 6;
    bubbles.push({
      origin: new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * 0.6,
        r * Math.sin(phi) * Math.sin(theta),
      ),
      // ~50% bots, ~25% boys, ~25% girls
      type: i % 2 === 0 ? 'bot' : i % 4 === 1 ? 'boy' : 'girl',
      delay: Math.random() * 0.6,
      speed: 0.8 + Math.random() * 0.4,
      wobble: Math.random() * Math.PI * 2,
    });
  }
  return bubbles;
}

function generateBursts(): BurstData[] {
  const bursts: BurstData[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < BURST_COUNT; i++) {
    const y = 1 - (i / (BURST_COUNT - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    bursts.push({
      dir: new THREE.Vector3(Math.cos(theta) * radius, y * 0.7, Math.sin(theta) * radius).normalize(),
      speed: 8 + Math.random() * 6,
      rotSpeed: (Math.random() - 0.5) * 4,
    });
  }
  return bursts;
}

/* ── AMBIENT PARTICLES ──────────────────────────────────── */
const palette = ['#f7931a', '#ffb347', '#ffd27d', '#59c3ff', '#7bc8ff', '#a855f7', '#22ff88'];

const AmbientParticles: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors, speeds } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const spd = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 5 + Math.random() * 25;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      spd[i] = 0.5 + Math.random() * 1.5;
    }
    return { positions: pos, colors: col, speeds: spd };
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += 0.0003;
    const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 1] += Math.sin(clock.elapsedTime * speeds[i] + i) * 0.003;
      arr[i * 3] += Math.cos(clock.elapsedTime * 0.2 + i * 0.1) * 0.001;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} vertexColors transparent opacity={0.5} blending={THREE.AdditiveBlending} sizeAttenuation depthWrite={false} />
    </points>
  );
};

/* ── MAIN SCENE ─────────────────────────────────────────── */
const LandingScene: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Group>(null);
  const coreMeshRef = useRef<THREE.Mesh>(null);
  const coreGlowRef = useRef<THREE.Mesh>(null);
  const bubbleSpriteRefs = useRef<THREE.Sprite[]>([]);
  const bubbleBadgeRefs = useRef<THREE.Sprite[]>([]);
  const burstSpriteRefs = useRef<THREE.Sprite[]>([]);
  const startTime = useRef<number | null>(null);

  const { viewport } = useThree();
  const bubbles = useMemo(() => generateBubbles(), []);
  const bursts = useMemo(() => generateBursts(), []);

  const textures = useMemo(() => ({
    bot: makeEmojiTexture('🤖', '#59c3ff'),
    boy: makeEmojiTexture('👦', '#ffd36a'),
    girl: makeEmojiTexture('👧', '#ff8fcf'),
    check: makeShieldTexture(),
    miniBadge: makeShieldTexture(256),
  }), []);

  const coreEdgesGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(2.4, 2.4, 2.4);
    return new THREE.EdgesGeometry(box);
  }, []);

  // Inner wireframe (smaller, rotated 45°)
  const innerEdgesGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    return new THREE.EdgesGeometry(box);
  }, []);

  // ₿ symbol texture for core billboard
  const btcTexture = useMemo(() => {
    const sz = 256;
    const canvas = document.createElement('canvas');
    canvas.width = sz;
    canvas.height = sz;
    const ctx = canvas.getContext('2d')!;

    // Radial glow
    const glow = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz * 0.45);
    glow.addColorStop(0, 'rgba(247, 147, 26, 0.35)');
    glow.addColorStop(0.5, 'rgba(247, 147, 26, 0.08)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sz / 2, sz / 2, sz * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // ₿ symbol
    ctx.font = `bold ${sz * 0.55}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const grad = ctx.createLinearGradient(sz / 2, sz * 0.2, sz / 2, sz * 0.8);
    grad.addColorStop(0, '#ffd27d');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1, '#f7931a');
    ctx.fillStyle = grad;
    ctx.fillText('₿', sz / 2, sz / 2 + sz * 0.02);

    // Subtle outer ring
    ctx.strokeStyle = 'rgba(247, 147, 26, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sz / 2, sz / 2, sz * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Refs for inner cube + ₿ sprite + energy rings
  const innerCubeRef = useRef<THREE.Mesh>(null);
  const btcSpriteRef = useRef<THREE.Sprite>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (startTime.current === null) startTime.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startTime.current;
    const t = Math.min(elapsed, 20);

    if (groupRef.current) groupRef.current.rotation.y += 0.0008;

    // Fade out the entire core (₿, glow, rings, cubes) after animation finishes
    // Starts fading at t=4s, fully gone by t=7s
    const coreFade = t < 4 ? 1 : t > 7 ? 0 : 1 - (t - 4) / 3;

    if (coreRef.current) {
      coreRef.current.rotation.y += 0.003;
      coreRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.5) * 0.15;
      coreRef.current.visible = coreFade > 0.01;
    }

    // Inner cube rotates opposite direction
    if (innerCubeRef.current) {
      innerCubeRef.current.rotation.y -= 0.005;
      innerCubeRef.current.rotation.z += 0.002;
      const iMat = innerCubeRef.current.material as THREE.LineBasicMaterial;
      iMat.opacity = (0.15 + Math.sin(clock.elapsedTime * 3) * 0.1) * coreFade;
    }

    // ₿ always faces camera, pulses gently — stays PERMANENT (never fades)
    if (btcSpriteRef.current) {
      const btcMat = btcSpriteRef.current.material as THREE.SpriteMaterial;
      const btcScale = 2.2 + Math.sin(clock.elapsedTime * 2) * 0.15;
      btcSpriteRef.current.scale.setScalar(btcScale);
      if (t >= PHASE_CONVERGE_END && t < PHASE_BURST_END) {
        btcMat.opacity = 0.7 + Math.sin(clock.elapsedTime * 4) * 0.2;
      } else {
        btcMat.opacity = 0.4 + Math.sin(clock.elapsedTime * 1.5) * 0.1;
      }
    }

    // Energy rings pulse outward — fade with core
    if (ring1Ref.current) {
      const rScale = 2.5 + Math.sin(clock.elapsedTime * 1.2) * 0.5;
      ring1Ref.current.scale.setScalar(rScale);
      const rMat = ring1Ref.current.material as THREE.MeshBasicMaterial;
      rMat.opacity = (0.06 + Math.sin(clock.elapsedTime * 1.2) * 0.04) * coreFade;
    }
    if (ring2Ref.current) {
      const rScale = 3.0 + Math.cos(clock.elapsedTime * 0.9) * 0.6;
      ring2Ref.current.scale.setScalar(rScale);
      ring2Ref.current.rotation.x = Math.PI / 2;
      ring2Ref.current.rotation.z += 0.001;
      const rMat = ring2Ref.current.material as THREE.MeshBasicMaterial;
      rMat.opacity = (0.04 + Math.cos(clock.elapsedTime * 0.9) * 0.03) * coreFade;
    }

    if (coreMeshRef.current) {
      const mat = coreMeshRef.current.material as THREE.LineBasicMaterial;
      if (t < PHASE_CONVERGE_END) {
        mat.opacity = (0.3 + t / PHASE_CONVERGE_END * 0.4) * coreFade;
      } else if (t < PHASE_VERIFY_END) {
        const vt = (t - PHASE_CONVERGE_END) / (PHASE_VERIFY_END - PHASE_CONVERGE_END);
        mat.opacity = (0.7 + Math.sin(vt * Math.PI * 4) * 0.3) * coreFade;
        mat.color.lerp(new THREE.Color('#22ff88'), 0.03);
      } else {
        mat.opacity = (0.5 + Math.sin(clock.elapsedTime * 2) * 0.15) * coreFade;
        mat.color.lerp(new THREE.Color('#f7931a'), 0.005);
      }
    }

    if (coreGlowRef.current) {
      const mat = coreGlowRef.current.material as THREE.MeshBasicMaterial;
      if (t >= PHASE_CONVERGE_END && t < PHASE_BURST_END) {
        const vt = (t - PHASE_CONVERGE_END) / (PHASE_BURST_END - PHASE_CONVERGE_END);
        mat.opacity = (0.15 + vt * 0.3) * coreFade;
        const s = 2.5 + Math.sin(vt * Math.PI * 3) * 0.8;
        coreGlowRef.current.scale.setScalar(s);
      } else if (t >= PHASE_BURST_END) {
        mat.opacity = (0.08 + Math.sin(clock.elapsedTime * 1.5) * 0.04) * coreFade;
        coreGlowRef.current.scale.setScalar(2.5 + Math.sin(clock.elapsedTime * 0.8) * 0.3);
      } else {
        mat.opacity = (t / PHASE_CONVERGE_END * 0.12) * coreFade;
        coreGlowRef.current.scale.setScalar(2);
      }
    }

    // BUBBLES + BADGES
    const isPostVerify = t >= PHASE_BURST_END + 1;

    bubbleSpriteRefs.current.forEach((sprite, i) => {
      if (!sprite) return;
      const b = bubbles[i];
      const mat = sprite.material as THREE.SpriteMaterial;
      const badge = bubbleBadgeRefs.current[i];
      const localT = Math.max(0, t - b.delay);

      if (!isPostVerify) {
        // Pre-verify: converge toward core
        const progress = THREE.MathUtils.clamp(localT * b.speed / PHASE_CONVERGE_END, 0, 1);
        const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
        const target = new THREE.Vector3(0, 0, 0);
        const pos = b.origin.clone().lerp(target, eased);
        pos.x += Math.sin(clock.elapsedTime * 2.5 + b.wobble) * (1 - eased) * 0.5;
        pos.y += Math.cos(clock.elapsedTime * 1.8 + b.wobble * 2) * (1 - eased) * 0.3;
        sprite.position.copy(pos);
        const appear = THREE.MathUtils.smoothstep(localT, 0, 0.4);
        const shrink = eased > 0.85 ? 1 - (eased - 0.85) / 0.15 : 1;
        const s = appear * shrink * 1.6;
        sprite.scale.setScalar(s);
        mat.opacity = appear * shrink * 0.95;

        // Hide badge during convergence
        if (badge) {
          badge.visible = false;
        }
      } else {
        // Post-verify: ambient orbiting with shield badges
        const angle = clock.elapsedTime * AMBIENT_SPEED * b.speed + (i / BUBBLE_COUNT) * Math.PI * 2;
        const r = 6 + Math.sin(clock.elapsedTime * 0.3 + b.wobble) * 2;
        sprite.position.set(
          Math.cos(angle) * r,
          Math.sin(clock.elapsedTime * 0.5 + b.wobble) * 2,
          Math.sin(angle) * r,
        );
        const bubbleScale = 1.2 + Math.sin(clock.elapsedTime + i) * 0.15;
        sprite.scale.setScalar(bubbleScale);
        mat.opacity = 0.7 + Math.sin(clock.elapsedTime * 1.2 + i) * 0.15;

        // Show shield badge at top-right corner of bubble
        if (badge) {
          const fadeIn = THREE.MathUtils.smoothstep(t - (PHASE_BURST_END + 1), 0, 0.8);
          badge.visible = true;
          // Offset to top-right: +0.55 x, +0.55 y relative to bubble
          badge.position.set(
            sprite.position.x + bubbleScale * 0.45,
            sprite.position.y + bubbleScale * 0.45,
            sprite.position.z + 0.1,
          );
          badge.scale.setScalar(bubbleScale * 0.45);
          const badgeMat = badge.material as THREE.SpriteMaterial;
          badgeMat.opacity = fadeIn * (0.85 + Math.sin(clock.elapsedTime * 2 + i) * 0.1);
        }
      }
    });

    // BURST 🛡️ — shields fly past screen edges
    burstSpriteRefs.current.forEach((sprite, i) => {
      if (!sprite) return;
      const bd = bursts[i];
      const mat = sprite.material as THREE.SpriteMaterial;

      if (t >= PHASE_VERIFY_END && t < PHASE_BURST_END + 8) {
        const bt = t - PHASE_VERIFY_END;
        // Accelerating outward — starts slow, builds momentum
        const accel = bt * bt * 0.4;
        const progress = accel * bd.speed * 0.08;
        sprite.position.copy(bd.dir.clone().multiplyScalar(progress));
        sprite.visible = true;

        // Pop-in scale with slight rotation wobble
        const popIn = THREE.MathUtils.smoothstep(bt, 0, 0.15);
        const breathe = 1 + Math.sin(bt * bd.rotSpeed * 0.5) * 0.08;
        sprite.scale.setScalar(popIn * 1.8 * breathe);

        // Stay fully visible until well past the viewport, then fade
        const dist = sprite.position.length();
        const farEdge = 40; // way past any screen edge
        if (dist > farEdge * 0.6) {
          mat.opacity = Math.max(0, 1 - (dist - farEdge * 0.6) / (farEdge * 0.6));
        } else {
          mat.opacity = popIn;
        }
      } else {
        sprite.visible = false;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {/* Core Block — futuristic nested wireframes + ₿ + energy rings */}
      <group ref={coreRef}>
        {/* Outer wireframe cube */}
        <lineSegments ref={coreMeshRef} geometry={coreEdgesGeo}>
          <lineBasicMaterial color="#f7931a" transparent opacity={0.3} linewidth={1} />
        </lineSegments>

        {/* Inner wireframe cube (rotated, counter-spinning) */}
        <lineSegments ref={innerCubeRef} geometry={innerEdgesGeo} rotation={[Math.PI / 4, 0, Math.PI / 4]}>
          <lineBasicMaterial color="#66ccff" transparent opacity={0.2} linewidth={1} />
        </lineSegments>

        {/* Outer glow sphere */}
        <mesh ref={coreGlowRef}>
          <sphereGeometry args={[1.2, 24, 24]} />
          <meshBasicMaterial color="#f7931a" transparent opacity={0.08} side={THREE.BackSide} />
        </mesh>

        {/* Core center point */}
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial color="#ffcc66" transparent opacity={0.7} />
        </mesh>

        {/* ₿ Bitcoin symbol — always facing camera */}
        <sprite ref={btcSpriteRef} scale={[2.2, 2.2, 2.2]}>
          <spriteMaterial map={btcTexture} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>

        {/* Energy ring 1 — horizontal */}
        <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.0, 1.05, 64]} />
          <meshBasicMaterial color="#f7931a" transparent opacity={0.06} side={THREE.DoubleSide} />
        </mesh>

        {/* Energy ring 2 — vertical, slower */}
        <mesh ref={ring2Ref}>
          <ringGeometry args={[1.2, 1.25, 64]} />
          <meshBasicMaterial color="#66ccff" transparent opacity={0.04} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Bubbles 🤖 + 👦 + 👧 */}
      {bubbles.map((b, i) => (
        <React.Fragment key={`bubble-group-${i}`}>
          <sprite
            ref={(el) => { if (el) bubbleSpriteRefs.current[i] = el; }}
            position={b.origin.toArray()}
            scale={[0, 0, 0]}
          >
            <spriteMaterial
              map={b.type === 'bot' ? textures.bot : b.type === 'boy' ? textures.boy : textures.girl}
              transparent opacity={0} depthWrite={false} blending={THREE.NormalBlending}
            />
          </sprite>
          {/* Mini shield badge — shown after verification */}
          <sprite
            ref={(el) => { if (el) bubbleBadgeRefs.current[i] = el; }}
            visible={false}
            scale={[0, 0, 0]}
          >
            <spriteMaterial
              map={textures.miniBadge}
              transparent opacity={0} depthWrite={false} blending={THREE.NormalBlending}
            />
          </sprite>
        </React.Fragment>
      ))}

      {/* Burst ✅ */}
      {bursts.map((_, i) => (
        <sprite
          key={`burst-${i}`}
          ref={(el) => { if (el) burstSpriteRefs.current[i] = el; }}
          visible={false} scale={[0, 0, 0]}
        >
          <spriteMaterial
            map={textures.check}
            transparent opacity={0} depthWrite={false} blending={THREE.NormalBlending}
          />
        </sprite>
      ))}

      <AmbientParticles />
    </group>
  );
};

/* ── EXPORTED COMPONENT ─────────────────────────────────── */
interface LandingAnimationProps {
  onRevealed?: () => void;
}

const LandingAnimation: React.FC<LandingAnimationProps> = ({ onRevealed }) => {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRevealed(true);
      onRevealed?.();
    }, REVEAL_TIME * 1000);
    return () => clearTimeout(timer);
  }, [onRevealed]);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        {/* No background color — transparent to show LandingBackground beneath */}
        <fog attach="fog" args={['#0a0a0f', 25, 80]} />
        <PerspectiveCamera makeDefault fov={50} position={[0, 1, 16]} />

        <ambientLight color="#0f1222" intensity={0.5} />
        <pointLight color="#f7931a" intensity={2.5} distance={35} position={[6, 3, 6]} />
        <pointLight color="#59c3ff" intensity={1.8} distance={35} position={[-6, 4, -4]} />
        <pointLight color="#a855f7" intensity={1.0} distance={25} position={[0, -5, 8]} />

        <LandingScene />

        <EffectComposer>
          <Bloom intensity={1.8} luminanceThreshold={0.75} luminanceSmoothing={0.3} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default LandingAnimation;
