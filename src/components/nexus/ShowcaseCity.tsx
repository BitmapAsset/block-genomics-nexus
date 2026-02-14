/**
 * ShowcaseCity — Curated 3D Art Installations on Featured Bitmap Blocks
 * 
 * Philosophy: Less is more. Each block is a gallery piece, not a random city.
 * Parcels merge into mega-structures. Open spaces breathe. One cohesive palette.
 * Central landmark dominates. Everything intentional.
 */

import { useMemo } from 'react';
import * as THREE from 'three';

// ═══ Featured blocks ═══
const FEATURED_BLOCKS: Set<number> = new Set([
  0, 1, 9, 170, 478, 546, 2016,
  10000, 20000, 30000, 50000, 57043, 70000,
  100000, 150000, 200000, 210000,
  250000, 277316, 300000, 350000,
  400000, 420000, 450000, 478558,
  481824, 500000, 525000, 550000, 575000,
  600000, 625000, 630000, 650000,
  700000, 709632, 720000, 740000, 750000, 760000, 770000,
  780000, 790000, 800000, 810000, 820000, 830000,
  840000, 841000, 842000, 843000, 844000, 845000,
  850000, 855000, 860000, 865000, 870000, 875000,
  12345, 42069, 69420, 77777, 88888, 99999,
  111111, 123456, 222222, 234567, 314159,
  333333, 345678, 404404, 444444, 456789,
  500500, 555555, 567890, 600600, 654321,
  666666, 696969, 700700, 711711, 717317,
  718840, 720143, 738505, 745506, 745966,
  750750, 777777, 789012, 800800, 808080,
  812345, 823456, 834567, 845678, 856789, 867890,
]);

export function isFeaturedBlock(height: number): boolean {
  return FEATURED_BLOCKS.has(height);
}

// ═══ Seeded RNG ═══
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ═══ Era & Theme ═══
type Era = 'genesis' | 'ancient' | 'classical' | 'industrial' | 'modern' | 'cyber';

function getEra(h: number): Era {
  if (h < 1000) return 'genesis';
  if (h < 100000) return 'ancient';
  if (h < 300000) return 'classical';
  if (h < 500000) return 'industrial';
  if (h < 700000) return 'modern';
  return 'cyber';
}

interface ArtTheme {
  name: string;
  primary: string;
  accent: string;
  glow: string;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  transparent: boolean;
  opacity: number;
}

const ERA_THEMES: Record<Era, ArtTheme[]> = {
  genesis: [
    { name: 'Golden Monolith', primary: '#c8a050', accent: '#f7931a', glow: '#f7931a', emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.9, transparent: false, opacity: 1 },
    { name: 'Obsidian Dawn', primary: '#1a1a2e', accent: '#f7931a', glow: '#ff6600', emissiveIntensity: 1.2, roughness: 0.05, metalness: 1, transparent: false, opacity: 1 },
  ],
  ancient: [
    { name: 'Sandstone Temple', primary: '#d4a574', accent: '#8b6914', glow: '#c8a050', emissiveIntensity: 0.3, roughness: 0.8, metalness: 0.1, transparent: false, opacity: 1 },
    { name: 'Desert Crystal', primary: '#e8d5b7', accent: '#f7931a', glow: '#ffd700', emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.85 },
  ],
  classical: [
    { name: 'Marble Palace', primary: '#e8e0d0', accent: '#b8860b', glow: '#daa520', emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.4, transparent: false, opacity: 1 },
    { name: 'Bronze Age', primary: '#8b6914', accent: '#cd853f', glow: '#daa520', emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.8, transparent: false, opacity: 1 },
  ],
  industrial: [
    { name: 'Steel Cathedral', primary: '#4a5568', accent: '#f7931a', glow: '#ff4500', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.9, transparent: false, opacity: 1 },
    { name: 'Iron Garden', primary: '#2d3748', accent: '#48bb78', glow: '#38a169', emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.7, transparent: false, opacity: 1 },
  ],
  modern: [
    { name: 'Glass Horizon', primary: '#e2e8f0', accent: '#4fc3f7', glow: '#29b6f6', emissiveIntensity: 0.4, roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.7 },
    { name: 'White Oasis', primary: '#f7fafc', accent: '#f7931a', glow: '#f7931a', emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.5, transparent: false, opacity: 1 },
  ],
  cyber: [
    { name: 'Neon Nexus', primary: '#0d0d1a', accent: '#00f5d4', glow: '#00f5d4', emissiveIntensity: 2, roughness: 0, metalness: 1, transparent: false, opacity: 1 },
    { name: 'Plasma Core', primary: '#1a0a2e', accent: '#ff006e', glow: '#ff006e', emissiveIntensity: 1.8, roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.9 },
    { name: 'Aurora Circuit', primary: '#0a1628', accent: '#8338ec', glow: '#a855f7', emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.9, transparent: false, opacity: 1 },
  ],
};

// ═══ Art Installation Types ═══

interface ArtPiece {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

function createCentralMonument(theme: ArtTheme, blockSize: number, r: () => number): ArtPiece[] {
  const pieces: ArtPiece[] = [];
  const h = blockSize * (0.4 + r() * 0.3);
  const baseW = blockSize * 0.15;

  // Main spire
  pieces.push({
    geometry: new THREE.CylinderGeometry(baseW * 0.15, baseW, h, 6),
    material: new THREE.MeshStandardMaterial({
      color: theme.primary,
      roughness: theme.roughness,
      metalness: theme.metalness,
      transparent: theme.transparent,
      opacity: theme.opacity,
    }),
    position: [0, h / 2, 0],
  });

  // Glowing crown
  pieces.push({
    geometry: new THREE.OctahedronGeometry(baseW * 0.4),
    material: new THREE.MeshStandardMaterial({
      color: theme.accent,
      emissive: theme.glow,
      emissiveIntensity: theme.emissiveIntensity,
      roughness: 0,
      metalness: 1,
      transparent: true,
      opacity: 0.9,
    }),
    position: [0, h + baseW * 0.4, 0],
  });

  // Base platform (3 concentric rings)
  for (let i = 0; i < 3; i++) {
    const ringR = baseW * (2.5 - i * 0.6);
    const ringH = 0.08 * (3 - i);
    pieces.push({
      geometry: new THREE.CylinderGeometry(ringR, ringR * 1.1, ringH, 32),
      material: new THREE.MeshStandardMaterial({
        color: i === 0 ? theme.primary : theme.accent,
        roughness: theme.roughness + 0.1,
        metalness: theme.metalness * 0.8,
        emissive: i === 2 ? theme.glow : '#000000',
        emissiveIntensity: i === 2 ? theme.emissiveIntensity * 0.3 : 0,
      }),
      position: [0, ringH / 2 + i * 0.05, 0],
    });
  }

  return pieces;
}

function createFloatingRings(theme: ArtTheme, blockSize: number, r: () => number): ArtPiece[] {
  const pieces: ArtPiece[] = [];
  const count = 3 + Math.floor(r() * 3);

  for (let i = 0; i < count; i++) {
    const ringR = blockSize * (0.08 + r() * 0.12);
    const height = 1 + i * 1.5 + r() * 2;
    const tilt = (r() - 0.5) * Math.PI * 0.4;

    pieces.push({
      geometry: new THREE.TorusGeometry(ringR, ringR * 0.06, 16, 48),
      material: new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? theme.accent : theme.primary,
        emissive: theme.glow,
        emissiveIntensity: theme.emissiveIntensity * (0.5 + r() * 0.5),
        roughness: 0,
        metalness: 1,
        transparent: true,
        opacity: 0.8,
      }),
      position: [0, height, 0],
      rotation: [tilt, r() * Math.PI, 0],
    });
  }

  return pieces;
}

function createCrystalFormation(theme: ArtTheme, x: number, z: number, r: () => number): ArtPiece[] {
  const pieces: ArtPiece[] = [];
  const count = 2 + Math.floor(r() * 4);

  for (let i = 0; i < count; i++) {
    const h = 0.5 + r() * 3;
    const w = 0.1 + r() * 0.3;
    const ox = (r() - 0.5) * 1.5;
    const oz = (r() - 0.5) * 1.5;
    const tilt = (r() - 0.5) * 0.3;

    pieces.push({
      geometry: new THREE.ConeGeometry(w, h, 5 + Math.floor(r() * 3)),
      material: new THREE.MeshStandardMaterial({
        color: theme.accent,
        emissive: theme.glow,
        emissiveIntensity: theme.emissiveIntensity * (0.3 + r() * 0.7),
        roughness: theme.roughness,
        metalness: theme.metalness,
        transparent: true,
        opacity: 0.7 + r() * 0.3,
      }),
      position: [x + ox, h / 2, z + oz],
      rotation: [tilt, r() * Math.PI * 2, tilt],
    });
  }

  return pieces;
}

function createArchway(theme: ArtTheme, x: number, z: number, angle: number, r: () => number): ArtPiece[] {
  const pieces: ArtPiece[] = [];
  const h = 2 + r() * 2;
  const w = 1.5 + r();
  const thickness = 0.12;

  // Two pillars
  for (const side of [-1, 1]) {
    pieces.push({
      geometry: new THREE.BoxGeometry(thickness, h, thickness),
      material: new THREE.MeshStandardMaterial({
        color: theme.primary,
        roughness: theme.roughness,
        metalness: theme.metalness,
      }),
      position: [x + Math.cos(angle) * w * 0.5 * side, h / 2, z + Math.sin(angle) * w * 0.5 * side],
    });
  }

  // Arch top
  pieces.push({
    geometry: new THREE.TorusGeometry(w * 0.5, thickness * 0.6, 8, 16, Math.PI),
    material: new THREE.MeshStandardMaterial({
      color: theme.accent,
      emissive: theme.glow,
      emissiveIntensity: theme.emissiveIntensity * 0.5,
      roughness: 0.1,
      metalness: 0.9,
    }),
    position: [x, h, z],
    rotation: [0, angle, 0],
  });

  return pieces;
}

function createReflectingPool(theme: ArtTheme, blockSize: number): ArtPiece[] {
  const poolW = blockSize * 0.3;
  const poolD = blockSize * 0.12;

  return [{
    geometry: new THREE.BoxGeometry(poolW, 0.02, poolD),
    material: new THREE.MeshStandardMaterial({
      color: '#0a1628',
      roughness: 0,
      metalness: 1,
      transparent: true,
      opacity: 0.6,
      emissive: theme.glow,
      emissiveIntensity: 0.15,
    }),
    position: [0, 0.01, blockSize * 0.2],
  }];
}

function createOrbitingSpheres(theme: ArtTheme, centerY: number, r: () => number): ArtPiece[] {
  const pieces: ArtPiece[] = [];
  const count = 4 + Math.floor(r() * 4);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 1.5 + r() * 2;
    const y = centerY + (r() - 0.5) * 2;
    const size = 0.08 + r() * 0.15;

    pieces.push({
      geometry: new THREE.SphereGeometry(size, 12, 8),
      material: new THREE.MeshStandardMaterial({
        color: theme.accent,
        emissive: theme.glow,
        emissiveIntensity: theme.emissiveIntensity * 1.5,
        roughness: 0,
        metalness: 1,
      }),
      position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
    });
  }

  return pieces;
}

function createGroundGlow(theme: ArtTheme, blockSize: number): ArtPiece[] {
  return [{
    geometry: new THREE.RingGeometry(blockSize * 0.02, blockSize * 0.35, 64),
    material: new THREE.MeshStandardMaterial({
      color: theme.glow,
      emissive: theme.glow,
      emissiveIntensity: theme.emissiveIntensity * 0.2,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    }),
    position: [0, 0.005, 0],
    rotation: [-Math.PI / 2, 0, 0],
  }];
}

// ═══ Main Generator ═══

export interface ShowcaseBuildingData {
  parcelIndex: number;
  position: [number, number, number];
  building: { position: [number, number, number]; geometry: THREE.BufferGeometry; material: THREE.Material; extras: { geometry: THREE.BufferGeometry; material: THREE.Material; position: [number, number, number] }[] };
}

export function useShowcaseBuildings(
  blockHeight: number,
  parcels: { txIndex: number; x: number; z: number; width: number; depth: number; bytes: number; isCoinbase: boolean }[]
): ShowcaseBuildingData[] | null {
  return useMemo(() => {
    if (!isFeaturedBlock(blockHeight)) return null;
    if (parcels.length === 0) return null;

    const era = getEra(blockHeight);
    const themes = ERA_THEMES[era];
    const r0 = rng(blockHeight * 7919);
    const theme = themes[Math.floor(r0() * themes.length)];
    const rand = rng(blockHeight * 31337);

    // Block dimensions from parcels
    const minX = Math.min(...parcels.map(p => p.x));
    const maxX = Math.max(...parcels.map(p => p.x + p.width));
    const minZ = Math.min(...parcels.map(p => p.z));
    const maxZ = Math.max(...parcels.map(p => p.z + p.depth));
    const blockSize = Math.max(maxX - minX, maxZ - minZ);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const allPieces: ArtPiece[] = [];

    // 1. Central monument (always)
    const monument = createCentralMonument(theme, blockSize, rand);
    monument.forEach(p => { p.position[0] += cx; p.position[2] += cz; });
    allPieces.push(...monument);

    // 2. Floating rings around monument
    const rings = createFloatingRings(theme, blockSize, rand);
    rings.forEach(p => { p.position[0] += cx; p.position[2] += cz; });
    allPieces.push(...rings);

    // 3. Orbiting spheres
    const spheres = createOrbitingSpheres(theme, blockSize * 0.25, rand);
    spheres.forEach(p => { p.position[0] += cx; p.position[2] += cz; });
    allPieces.push(...spheres);

    // 4. Crystal formations at 3-5 strategic points (not every parcel!)
    const crystalCount = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < crystalCount; i++) {
      const angle = (i / crystalCount) * Math.PI * 2 + rand() * 0.5;
      const dist = blockSize * (0.2 + rand() * 0.15);
      const crystals = createCrystalFormation(theme, cx + Math.cos(angle) * dist, cz + Math.sin(angle) * dist, rand);
      allPieces.push(...crystals);
    }

    // 5. Archways (2-3 gateways)
    const archCount = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < archCount; i++) {
      const angle = (i / archCount) * Math.PI * 2;
      const dist = blockSize * 0.25;
      const arches = createArchway(theme, cx + Math.cos(angle) * dist, cz + Math.sin(angle) * dist, angle, rand);
      allPieces.push(...arches);
    }

    // 6. Reflecting pool
    const pool = createReflectingPool(theme, blockSize);
    pool.forEach(p => { p.position[0] += cx; p.position[2] += cz; });
    allPieces.push(...pool);

    // 7. Ground glow
    const glow = createGroundGlow(theme, blockSize);
    glow.forEach(p => { p.position[0] += cx; p.position[2] += cz; });
    allPieces.push(...glow);

    // Convert to ShowcaseBuildingData format (one entry per piece)
    return allPieces.map((piece, i) => ({
      parcelIndex: i,
      position: [0, 0, 0] as [number, number, number],
      building: {
        position: piece.position,
        geometry: piece.geometry,
        material: piece.material,
        extras: [] as { geometry: THREE.BufferGeometry; material: THREE.Material; position: [number, number, number] }[],
      },
      rotation: piece.rotation,
      scale: piece.scale,
    }));
  }, [blockHeight, parcels]);
}

// ═══ Renderer ═══

export function ShowcaseCityRenderer({ buildings }: { buildings: (ShowcaseBuildingData & { rotation?: [number, number, number]; scale?: [number, number, number] })[] }) {
  return (
    <group name="showcase-art">
      {buildings.map((b, i) => (
        <mesh
          key={i}
          position={b.building.position}
          rotation={b.rotation ? [b.rotation[0], b.rotation[1], b.rotation[2]] : undefined}
          scale={b.scale}
          geometry={b.building.geometry}
          material={b.building.material}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
