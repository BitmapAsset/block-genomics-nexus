'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Line,
  LineBasicMaterial,
  Object3D,
  QuadraticBezierCurve3,
  Quaternion,
  Vector3,
} from 'three';
import type {
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
} from 'three';

/* ══════════════════════════════════════════════════════════
   IMMERSIVE LANDING BACKGROUND v2 — "AAA Studio Grade"

   Multi-layered cinematic scene: infinite grid, rising block
   towers with holographic data, DNA helixes, volumetric light
   shafts, aurora bands, data streams, particle nebula,
   energy connections, mouse parallax + camera breathing.

   Performance: Mobile-aware — reduced complexity on low-end devices.
   ══════════════════════════════════════════════════════════ */

/* ── Device capability detection ─────────────────────────── */
const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const isLowEnd = typeof navigator !== 'undefined' && (
  (navigator.hardwareConcurrency ?? 8) <= 4 ||
  ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 4
);
const isReduced = isMobile || isLowEnd;

const GRID_SIZE = 100;
const GRID_DIVISIONS = 100;
const BLOCK_COUNT = isReduced ? 60 : 180;
const DNA_COUNT = isReduced ? 3 : 7;
const PARTICLE_COUNT = isReduced ? 300 : 900;
const CONNECTION_COUNT = isReduced ? 20 : 60;
const DATA_STREAM_COUNT = isReduced ? 8 : 25;

const CYAN = new Color('#66ccff');
const PURPLE = new Color('#a855f7');
const GOLD = new Color('#f7931a');
const EMERALD = new Color('#22ff88');
const PINK = new Color('#ff6699');
const WHITE = new Color('#ffffff');

/* ── Mouse Parallax Tracker ─────────────────────────────── */
const mousePos = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
let mouseListenerAttached = false;
function attachMouseListener() {
  if (mouseListenerAttached || typeof window === 'undefined') return;
  mouseListenerAttached = true;
  window.addEventListener('mousemove', (e) => {
    mousePos.x = (e.clientX / window.innerWidth - 0.5) * 2;
    mousePos.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
}

/* ── Shader: Grid with intersection glow + fade ─────────── */
const gridVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const gridFragmentShader = `
  uniform float uTime;
  uniform vec3 uCyan;
  uniform vec3 uPurple;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  
  void main() {
    vec2 grid = abs(fract(vWorldPos.xz * 0.5) - 0.5);
    float line = min(grid.x, grid.y);
    float gridLine = 1.0 - smoothstep(0.0, 0.03, line);
    
    // Intersection glow
    float intersection = (1.0 - smoothstep(0.0, 0.06, grid.x)) * (1.0 - smoothstep(0.0, 0.06, grid.y));
    
    // Distance fade
    float dist = length(vWorldPos.xz);
    float fade = 1.0 - smoothstep(10.0, 50.0, dist);
    
    // Scanning pulse
    float scan = smoothstep(-0.5, 0.0, sin(vWorldPos.z * 0.1 - uTime * 0.8)) * 0.3;
    
    // Color mix based on distance
    vec3 color = mix(uCyan, uPurple, smoothstep(15.0, 40.0, dist));
    
    float alpha = (gridLine * 0.12 + intersection * 0.4 + scan * 0.08) * fade;
    
    gl_FragColor = vec4(color, alpha);
  }
`;

/* ── Infinite Grid with Shader ──────────────────────────── */
const InfiniteGrid: React.FC = () => {
  const matRef = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uCyan: { value: CYAN },
    uPurple: { value: PURPLE },
  }), []);

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <group position={[0, -8, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_SIZE, GRID_SIZE, 1, 1]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={gridVertexShader}
          fragmentShader={gridFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      
      {/* Secondary finer sub-grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[GRID_SIZE * 0.6, GRID_SIZE * 0.6, 1, 1]} />
        <shaderMaterial
          vertexShader={gridVertexShader}
          fragmentShader={gridFragmentShader.replace('0.5)', '2.0)').replace('0.12', '0.04')}
          uniforms={{
            uTime: uniforms.uTime,
            uCyan: { value: new Color('#88ddff') },
            uPurple: { value: PURPLE },
          }}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
};

/* ── Block Tower Data ───────────────────────────────────── */
interface BlockData {
  x: number;
  z: number;
  height: number;
  color: Color;
  emissiveColor: Color;
  speed: number;
  phase: number;
  isSpecial: boolean;
  tier: number; // 0=small, 1=medium, 2=tall, 3=monumental
}

/* ── Block Towers with Emissive Tops + Holographic Rings ── */
const BlockTowers: React.FC = () => {
  const meshRef = useRef<InstancedMesh>(null);
  const topRef = useRef<InstancedMesh>(null);
  const ringRef = useRef<InstancedMesh>(null);
  
  const blocks = useMemo<BlockData[]>(() => {
    const arr: BlockData[] = [];
    const colors = [CYAN, PURPLE, GOLD, EMERALD, PINK];
    
    for (let i = 0; i < BLOCK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.pow(Math.random(), 0.7) * 35;
      const isSpecial = Math.random() < 0.06;
      const tier = isSpecial ? 3 : Math.random() < 0.15 ? 2 : Math.random() < 0.4 ? 1 : 0;
      const baseHeight = [0.3, 1.5, 3.5, 7][tier];
      const color = isSpecial ? GOLD : colors[Math.floor(Math.random() * colors.length)];
      
      arr.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist - 12,
        height: baseHeight + Math.random() * baseHeight * 0.5,
        color,
        emissiveColor: color.clone().multiplyScalar(2),
        speed: 0.2 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        isSpecial,
        tier,
      });
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new Object3D(), []);
  const tempColor = useMemo(() => new Color(), []);

  useEffect(() => {
    if (!meshRef.current || !topRef.current || !ringRef.current) return;
    blocks.forEach((b, i) => {
      tempColor.copy(b.color);
      meshRef.current!.setColorAt(i, tempColor);
      tempColor.copy(b.emissiveColor);
      topRef.current!.setColorAt(i, tempColor);
      tempColor.copy(b.color).multiplyScalar(0.6);
      ringRef.current!.setColorAt(i, tempColor);
    });
    meshRef.current.instanceColor!.needsUpdate = true;
    topRef.current.instanceColor!.needsUpdate = true;
    ringRef.current.instanceColor!.needsUpdate = true;
  }, [blocks, tempColor]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !topRef.current || !ringRef.current) return;
    const t = clock.elapsedTime;
    
    blocks.forEach((b, i) => {
      const breathe = Math.sin(t * b.speed + b.phase) * 0.3;
      const h = b.height + breathe;
      const baseWidth = [0.25, 0.35, 0.45, 0.6][b.tier];
      
      // Main tower body
      dummy.position.set(b.x, -8 + h / 2, b.z);
      dummy.scale.set(baseWidth, h, baseWidth);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      
      // Emissive top cap
      dummy.position.set(b.x, -8 + h + 0.05, b.z);
      dummy.scale.set(baseWidth + 0.05, 0.08, baseWidth + 0.05);
      dummy.updateMatrix();
      topRef.current!.setMatrixAt(i, dummy.matrix);
      
      // Holographic ring orbiting the tower
      const ringY = -8 + h * (0.5 + Math.sin(t * b.speed * 0.5 + b.phase) * 0.3);
      const ringScale = baseWidth * 2 + Math.sin(t * 2 + b.phase) * 0.1;
      dummy.position.set(b.x, ringY, b.z);
      dummy.scale.set(ringScale, ringScale, ringScale);
      dummy.rotation.set(Math.PI / 2, t * b.speed, 0);
      dummy.updateMatrix();
      ringRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    topRef.current.instanceMatrix.needsUpdate = true;
    ringRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Tower bodies */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, BLOCK_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          transparent
          opacity={0.7}
          roughness={0.3}
          metalness={0.8}
          emissiveIntensity={0.3}
        />
      </instancedMesh>
      
      {/* Emissive top caps */}
      <instancedMesh ref={topRef} args={[undefined, undefined, BLOCK_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.9} blending={AdditiveBlending} />
      </instancedMesh>
      
      {/* Holographic rings */}
      <instancedMesh ref={ringRef} args={[undefined, undefined, BLOCK_COUNT]}>
        <ringGeometry args={[0.8, 1.0, 24]} />
        <meshBasicMaterial transparent opacity={0.12} blending={AdditiveBlending} side={DoubleSide} />
      </instancedMesh>
    </>
  );
};

/* ── Floating DNA Helixes (enhanced) ────────────────────── */
const DNAHelix: React.FC<{
  position: [number, number, number];
  scale: number;
  speed: number;
  color1: Color;
  color2: Color;
  pairs: number;
}> = ({ position, scale: s, speed, color1, color2, pairs }) => {
  const groupRef = useRef<Group>(null);
  const RADIUS = 0.8;
  const HEIGHT = 6;
  const TURNS = 2.5;

  const { strand1, strand2, rungs, spheres } = useMemo(() => {
    const s1Points: Vector3[] = [];
    const s2Points: Vector3[] = [];
    const rungData: { p1: Vector3; p2: Vector3; color: Color }[] = [];
    const sphereData: { pos: Vector3; color: Color }[] = [];
    
    for (let i = 0; i <= pairs; i++) {
      const t = i / pairs;
      const angle = t * Math.PI * 2 * TURNS;
      const y = (t - 0.5) * HEIGHT;
      
      const x1 = Math.cos(angle) * RADIUS;
      const z1 = Math.sin(angle) * RADIUS;
      const x2 = Math.cos(angle + Math.PI) * RADIUS;
      const z2 = Math.sin(angle + Math.PI) * RADIUS;
      
      s1Points.push(new Vector3(x1, y, z1));
      s2Points.push(new Vector3(x2, y, z2));
      
      if (i % 2 === 0) {
        rungData.push({
          p1: new Vector3(x1, y, z1),
          p2: new Vector3(x2, y, z2),
          color: i % 4 === 0 ? color1 : color2,
        });
      }
      
      // Glow spheres at each node
      if (i % 3 === 0) {
        sphereData.push({ pos: new Vector3(x1, y, z1), color: color1 });
        sphereData.push({ pos: new Vector3(x2, y, z2), color: color2 });
      }
    }
    
    return {
      strand1: new CatmullRomCurve3(s1Points),
      strand2: new CatmullRomCurve3(s2Points),
      rungs: rungData,
      spheres: sphereData,
    };
  }, [pairs, color1, color2]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += speed * 0.008;
    groupRef.current.position.y = position[1] + Math.sin(clock.elapsedTime * speed * 0.4) * 0.8;
    groupRef.current.position.x = position[0] + Math.cos(clock.elapsedTime * speed * 0.2) * 0.3;
  });

  return (
    <group ref={groupRef} position={position} scale={[s, s, s]}>
      {/* Strand 1 — thicker backbone */}
      <mesh>
        <tubeGeometry args={[strand1, 64, 0.07, 8, false]} />
        <meshBasicMaterial color={color1} transparent opacity={0.5} blending={AdditiveBlending} />
      </mesh>
      {/* Strand 2 */}
      <mesh>
        <tubeGeometry args={[strand2, 64, 0.07, 8, false]} />
        <meshBasicMaterial color={color2} transparent opacity={0.5} blending={AdditiveBlending} />
      </mesh>
      {/* Rungs with color variation */}
      {rungs.map((rung, i) => {
        const mid = rung.p1.clone().lerp(rung.p2, 0.5);
        const dir = rung.p2.clone().sub(rung.p1);
        const len = dir.length();
        return (
          <mesh key={i} position={mid.toArray()} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize())}>
            <cylinderGeometry args={[0.025, 0.025, len, 4]} />
            <meshBasicMaterial color={rung.color} transparent opacity={0.2} blending={AdditiveBlending} />
          </mesh>
        );
      })}
      {/* Glow spheres at nodes */}
      {spheres.map((sp, i) => (
        <mesh key={`sp-${i}`} position={sp.pos.toArray()}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color={sp.color} transparent opacity={0.6} blending={AdditiveBlending} />
        </mesh>
      ))}
      {/* Central axis glow */}
      <mesh>
        <cylinderGeometry args={[0.02, 0.02, HEIGHT * 1.1, 8]} />
        <meshBasicMaterial color={WHITE} transparent opacity={0.03} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
};

const ALL_HELIXES = [
  { pos: [-16, 3, -22] as [number, number, number], scale: 1.8, speed: 0.35, c1: CYAN, c2: PURPLE, pairs: 32 },
  { pos: [20, -1, -28] as [number, number, number], scale: 1.4, speed: 0.5, c1: GOLD, c2: CYAN, pairs: 28 },
  { pos: [-10, 5, -38] as [number, number, number], scale: 2.2, speed: 0.25, c1: PURPLE, c2: EMERALD, pairs: 36 },
  { pos: [28, 1, -18] as [number, number, number], scale: 1.0, speed: 0.6, c1: CYAN, c2: GOLD, pairs: 24 },
  { pos: [0, -2, -45] as [number, number, number], scale: 2.0, speed: 0.3, c1: EMERALD, c2: PURPLE, pairs: 30 },
  { pos: [-25, -1, -30] as [number, number, number], scale: 0.9, speed: 0.7, c1: PINK, c2: CYAN, pairs: 20 },
  { pos: [12, 6, -35] as [number, number, number], scale: 1.6, speed: 0.4, c1: GOLD, c2: EMERALD, pairs: 28 },
];

const FloatingDNA: React.FC = () => {
  const helixes = useMemo(() => ALL_HELIXES.slice(0, DNA_COUNT), []);

  return (
    <>
      {helixes.map((h, i) => (
        <DNAHelix key={i} position={h.pos} scale={h.scale} speed={h.speed} color1={h.c1} color2={h.c2} pairs={h.pairs} />
      ))}
    </>
  );
};

/* ── Multi-Layer Particle Nebula ────────────────────────── */
const ParticleNebula: React.FC = () => {
  const nearRef = useRef<Points>(null);
  const farRef = useRef<Points>(null);
  const dustRef = useRef<Points>(null);
  const palette = useMemo(() => [CYAN, PURPLE, GOLD, EMERALD, PINK, WHITE], []);

  const nearCount = 300;
  const farCount = 400;
  const dustCount = 200;

  const nearData = useMemo(() => {
    const pos = new Float32Array(nearCount * 3);
    const col = new Float32Array(nearCount * 3);
    const vel = new Float32Array(nearCount * 3);
    for (let i = 0; i < nearCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.pow(Math.random(), 0.5) * 25;
      pos[i * 3] = Math.cos(angle) * dist;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 15;
      pos[i * 3 + 2] = Math.sin(angle) * dist - 10;
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      vel[i * 3] = (Math.random() - 0.5) * 0.003;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }
    return { pos, col, vel };
  }, [palette]);

  const farData = useMemo(() => {
    const pos = new Float32Array(farCount * 3);
    const col = new Float32Array(farCount * 3);
    for (let i = 0; i < farCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      pos[i * 3] = Math.cos(angle) * dist;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = Math.sin(angle) * dist - 20;
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r * 0.5; col[i * 3 + 1] = c.g * 0.5; col[i * 3 + 2] = c.b * 0.5;
    }
    return { pos, col };
  }, [palette]);

  const dustData = useMemo(() => {
    const pos = new Float32Array(dustCount * 3);
    const col = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80 - 10;
      col[i * 3] = 1; col[i * 3 + 1] = 1; col[i * 3 + 2] = 1;
    }
    return { pos, col };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    
    // Near particles — active movement
    if (nearRef.current) {
      const arr = nearRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < nearCount; i++) {
        arr[i * 3] += nearData.vel[i * 3] + Math.sin(t * 0.3 + i * 0.1) * 0.001;
        arr[i * 3 + 1] += nearData.vel[i * 3 + 1] + Math.cos(t * 0.2 + i * 0.05) * 0.001;
        arr[i * 3 + 2] += nearData.vel[i * 3 + 2];
      }
      nearRef.current.geometry.attributes.position.needsUpdate = true;
      nearRef.current.rotation.y += 0.00015;
    }
    
    // Far particles — slow drift
    if (farRef.current) {
      farRef.current.rotation.y += 0.00005;
      farRef.current.rotation.x = Math.sin(t * 0.1) * 0.02;
    }
    
    // Dust motes — twinkle
    if (dustRef.current) {
      dustRef.current.rotation.y -= 0.0001;
      const mat = dustRef.current.material as PointsMaterial;
      mat.opacity = 0.15 + Math.sin(t * 0.8) * 0.05;
    }
  });

  return (
    <>
      {/* Near — large bright particles */}
      <points ref={nearRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[nearData.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[nearData.col, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.12} vertexColors transparent opacity={0.7} blending={AdditiveBlending} sizeAttenuation depthWrite={false} />
      </points>
      
      {/* Far — smaller dimmer particles */}
      <points ref={farRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[farData.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[farData.col, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.06} vertexColors transparent opacity={0.4} blending={AdditiveBlending} sizeAttenuation depthWrite={false} />
      </points>
      
      {/* Dust motes — tiny white sparkles */}
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustData.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[dustData.col, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.03} vertexColors transparent opacity={0.2} blending={AdditiveBlending} sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
};

/* ── Data Streams (shooting beams of light) ─────────────── */
const DataStreams: React.FC = () => {
  const groupRef = useRef<Group>(null);
  
  interface StreamData {
    startPos: Vector3;
    direction: Vector3;
    speed: number;
    length: number;
    color: Color;
    delay: number;
    lifetime: number;
  }
  
  const streams = useMemo<StreamData[]>(() => {
    const arr: StreamData[] = [];
    for (let i = 0; i < DATA_STREAM_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.3) * 0.5;
      arr.push({
        startPos: new Vector3(
          (Math.random() - 0.5) * 60,
          -5 + Math.random() * 15,
          -10 + Math.random() * -30
        ),
        direction: new Vector3(Math.cos(angle), elevation, Math.sin(angle)).normalize(),
        speed: 15 + Math.random() * 25,
        length: 2 + Math.random() * 5,
        color: [CYAN, PURPLE, GOLD, EMERALD][Math.floor(Math.random() * 4)],
        delay: Math.random() * 10,
        lifetime: 3 + Math.random() * 5,
      });
    }
    return arr;
  }, []);

  const meshRefs = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    
    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = streams[i];
      const cycleTime = (t + s.delay) % s.lifetime;
      const progress = cycleTime / s.lifetime;
      
      // Position along path
      const pos = s.startPos.clone().add(s.direction.clone().multiplyScalar(progress * s.speed * s.lifetime));
      mesh.position.copy(pos);
      
      // Orient along direction
      const lookTarget = pos.clone().add(s.direction);
      mesh.lookAt(lookTarget);
      
      // Scale: fade in, persist, fade out
      const fadeIn = Math.min(progress * 5, 1);
      const fadeOut = Math.max(1 - (progress - 0.7) / 0.3, 0);
      const alpha = fadeIn * (progress > 0.7 ? fadeOut : 1);
      
      mesh.scale.set(0.03, 0.03, s.length);
      const mat = mesh.material as MeshBasicMaterial;
      mat.opacity = alpha * 0.4;
    });
  });

  return (
    <group ref={groupRef}>
      {streams.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
        >
          <cylinderGeometry args={[1, 0.3, 1, 4]} />
          <meshBasicMaterial color={s.color} transparent opacity={0} blending={AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
};

/* ── Aurora Bands ───────────────────────────────────────── */
const AuroraBands: React.FC = () => {
  const band1Ref = useRef<Mesh>(null);
  const band2Ref = useRef<Mesh>(null);
  const band3Ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    
    [band1Ref, band2Ref, band3Ref].forEach((ref, i) => {
      if (!ref.current) return;
      const mat = ref.current.material as MeshBasicMaterial;
      mat.opacity = 0.015 + Math.sin(t * (0.3 + i * 0.15) + i * 2) * 0.008;
      ref.current.position.y = 8 + i * 3 + Math.sin(t * 0.2 + i) * 2;
      ref.current.rotation.z = Math.sin(t * 0.1 + i * 1.5) * 0.1;
      ref.current.scale.x = 1 + Math.sin(t * 0.15 + i) * 0.15;
    });
  });

  return (
    <>
      <mesh ref={band1Ref} position={[0, 10, -35]}>
        <planeGeometry args={[120, 8]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.02} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
      <mesh ref={band2Ref} position={[5, 13, -40]}>
        <planeGeometry args={[100, 6]} />
        <meshBasicMaterial color={PURPLE} transparent opacity={0.015} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
      <mesh ref={band3Ref} position={[-5, 16, -45]}>
        <planeGeometry args={[80, 5]} />
        <meshBasicMaterial color={EMERALD} transparent opacity={0.01} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
    </>
  );
};

/* ── Volumetric Light Shafts ────────────────────────────── */
const LightShafts: React.FC = () => {
  const shafts = useRef<(Mesh | null)[]>([]);
  
  const shaftData = useMemo(() => [
    { x: -15, z: -25, color: CYAN, width: 3, height: 30 },
    { x: 10, z: -30, color: PURPLE, width: 2.5, height: 25 },
    { x: 25, z: -20, color: GOLD, width: 2, height: 28 },
    { x: -8, z: -35, color: EMERALD, width: 1.5, height: 22 },
    { x: 0, z: -15, color: CYAN, width: 4, height: 35 },
  ], []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    shafts.current.forEach((mesh, i) => {
      if (!mesh) return;
      const mat = mesh.material as MeshBasicMaterial;
      mat.opacity = 0.008 + Math.sin(t * 0.4 + i * 1.3) * 0.004;
      mesh.rotation.z = Math.sin(t * 0.05 + i) * 0.05;
    });
  });

  return (
    <>
      {shaftData.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => { shafts.current[i] = el; }}
          position={[s.x, s.height / 2 - 8, s.z]}
        >
          <planeGeometry args={[s.width, s.height]} />
          <meshBasicMaterial color={s.color} transparent opacity={0.01} blending={AdditiveBlending} side={DoubleSide} />
        </mesh>
      ))}
    </>
  );
};

/* ── Energy Connections (curved beams between towers) ───── */
const EnergyConnections: React.FC = () => {
  const groupRef = useRef<Group>(null);
  
  const { lines, speeds } = useMemo(() => {
    const lineObjs: Line[] = [];
    const spds: number[] = [];
    
    for (let i = 0; i < CONNECTION_COUNT; i++) {
      const a1 = Math.random() * Math.PI * 2;
      const d1 = 6 + Math.random() * 30;
      const a2 = a1 + (Math.random() - 0.5) * 1.8;
      const d2 = 6 + Math.random() * 30;
      
      const start = new Vector3(Math.cos(a1) * d1, -8 + Math.random() * 5, Math.sin(a1) * d1 - 12);
      const end = new Vector3(Math.cos(a2) * d2, -8 + Math.random() * 5, Math.sin(a2) * d2 - 12);
      const mid = start.clone().lerp(end, 0.5);
      mid.y += 1.5 + Math.random() * 4;
      
      const curve = new QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(24);
      const geo = new BufferGeometry().setFromPoints(points);
      const color = [CYAN, PURPLE, GOLD, EMERALD][Math.floor(Math.random() * 4)];
      const mat = new LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.05,
        blending: AdditiveBlending,
      });
      
      lineObjs.push(new Line(geo, mat));
      spds.push(0.3 + Math.random() * 1.5);
    }
    
    return { lines: lineObjs, speeds: spds };
  }, []);

  useEffect(() => {
    if (!groupRef.current) return;
    lines.forEach(l => groupRef.current!.add(l));
    return () => {
      lines.forEach(l => {
        l.geometry.dispose();
        (l.material as LineBasicMaterial).dispose();
      });
    };
  }, [lines]);

  useFrame(({ clock }) => {
    lines.forEach((l, i) => {
      const mat = l.material as LineBasicMaterial;
      mat.opacity = 0.03 + Math.sin(clock.elapsedTime * speeds[i] + i) * 0.025;
    });
  });

  return <group ref={groupRef} />;
};

/* ── Horizon Glow (enhanced) ────────────────────────────── */
const HorizonGlow: React.FC = () => {
  const glowRef = useRef<Mesh>(null);
  
  useFrame(({ clock }) => {
    if (!glowRef.current) return;
    const mat = glowRef.current.material as MeshBasicMaterial;
    mat.opacity = 0.08 + Math.sin(clock.elapsedTime * 0.3) * 0.03;
  });

  return (
    <>
      {/* Primary horizon glow */}
      <mesh ref={glowRef} position={[0, -6, -45]} rotation={[0.1, 0, 0]}>
        <planeGeometry args={[140, 20]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.08} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
      {/* Purple accent */}
      <mesh position={[0, -4, -50]} rotation={[0.05, 0, 0]}>
        <planeGeometry args={[120, 12]} />
        <meshBasicMaterial color={PURPLE} transparent opacity={0.04} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
      {/* Gold warmth from below */}
      <mesh position={[0, -9, -30]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[15, 32]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.015} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
    </>
  );
};

/* ── Central Nexus Core (focal point) ───────────────────── */
const NexusCore: React.FC = () => {
  const coreRef = useRef<Group>(null);
  const outerRingRef = useRef<Mesh>(null);
  const innerRingRef = useRef<Mesh>(null);
  const sphereRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (coreRef.current) {
      coreRef.current.rotation.y += 0.002;
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z += 0.003;
      outerRingRef.current.rotation.x = Math.sin(t * 0.5) * 0.3;
      const mat = outerRingRef.current.material as MeshBasicMaterial;
      mat.opacity = 0.08 + Math.sin(t * 2) * 0.03;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z -= 0.005;
      innerRingRef.current.rotation.y = Math.cos(t * 0.4) * 0.4;
      const mat = innerRingRef.current.material as MeshBasicMaterial;
      mat.opacity = 0.1 + Math.sin(t * 3) * 0.04;
    }
    if (sphereRef.current) {
      const s = 0.5 + Math.sin(t * 1.5) * 0.05;
      sphereRef.current.scale.setScalar(s);
      const mat = sphereRef.current.material as MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 2.5) * 0.05;
    }
  });

  return (
    <group ref={coreRef} position={[0, 0, -10]}>
      {/* Central energy sphere */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshBasicMaterial color={WHITE} transparent opacity={0.15} blending={AdditiveBlending} />
      </mesh>
      
      {/* Inner ring */}
      <mesh ref={innerRingRef}>
        <torusGeometry args={[1.5, 0.02, 16, 64]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.1} blending={AdditiveBlending} />
      </mesh>
      
      {/* Outer ring */}
      <mesh ref={outerRingRef}>
        <torusGeometry args={[2.5, 0.015, 16, 64]} />
        <meshBasicMaterial color={PURPLE} transparent opacity={0.08} blending={AdditiveBlending} />
      </mesh>
      
      {/* Glow halo */}
      <sprite>
        <spriteMaterial color={CYAN} transparent opacity={0.04} blending={AdditiveBlending} />
      </sprite>
    </group>
  );
};

/* ── Camera Controller (parallax + cinematic breathing) ─── */
const CameraController: React.FC = () => {
  const { camera } = useThree();
  const targetPos = useRef(new Vector3(0, 2, 20));
  const breathOffset = useRef(0);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    
    // Smooth mouse parallax
    mousePos.smoothX += (mousePos.x - mousePos.smoothX) * 0.03;
    mousePos.smoothY += (mousePos.y - mousePos.smoothY) * 0.03;
    
    // Cinematic breathing — slow, subtle camera movement
    breathOffset.current = Math.sin(t * 0.15) * 0.8;
    const breathY = Math.cos(t * 0.12) * 0.4;
    
    targetPos.current.set(
      mousePos.smoothX * 6 + breathOffset.current,
      2 - mousePos.smoothY * 3 + breathY,
      20
    );
    
    camera.position.lerp(targetPos.current, 0.02);
    camera.lookAt(0, -2, -15);
  });

  return null;
};

/* ── Main Scene ─────────────────────────────────────────── */
const NexusScene: React.FC = () => {
  return (
    <>
      <CameraController />
      <InfiniteGrid />
      <BlockTowers />
      <FloatingDNA />
      <NexusCore />
      <ParticleNebula />
      <DataStreams />
      <EnergyConnections />
      <AuroraBands />
      <LightShafts />
      <HorizonGlow />
    </>
  );
};

/* ── Exported Component ─────────────────────────────────── */
const LandingBackground: React.FC = () => {
  // Attach mouse listener on mount instead of at module scope
  React.useEffect(() => { attachMouseListener(); }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
      <Canvas
        dpr={isReduced ? [1, 1] : [1, 1.5]}
        gl={{ antialias: !isReduced, alpha: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#030308']} />
        <fog attach="fog" args={['#030308', 15, 65]} />
        <PerspectiveCamera makeDefault fov={60} position={[0, 2, 20]} />

        {/* Cinematic lighting rig — fewer lights on mobile */}
        <ambientLight color="#0a0a2f" intensity={0.2} />
        <pointLight color="#66ccff" intensity={3} distance={60} position={[12, 10, -15]} />
        <pointLight color="#a855f7" intensity={2} distance={55} position={[-12, 8, -25]} />
        <pointLight color="#f7931a" intensity={2} distance={45} position={[0, -6, -5]} />
        {!isReduced && <pointLight color="#22ff88" intensity={1} distance={35} position={[20, 2, -35]} />}
        {!isReduced && <pointLight color="#ff6699" intensity={0.8} distance={30} position={[-18, -3, -15]} />}
        {!isReduced && <directionalLight color="#66ccff" intensity={0.15} position={[0, 5, -50]} />}

        <NexusScene />

        {/* Post-processing: Bloom only (removed ChromaticAberration + Vignette for perf) */}
        <EffectComposer>
          <Bloom
            intensity={isReduced ? 1.2 : 2.0}
            luminanceThreshold={0.5}
            luminanceSmoothing={0.3}
            mipmapBlur={!isReduced}
          />
        </EffectComposer>
      </Canvas>
      {/* CSS vignette — zero GPU cost, replaces post-processing Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 150px 60px rgba(3,3,8,0.7)',
        }}
      />
    </div>
  );
};

export default LandingBackground;
