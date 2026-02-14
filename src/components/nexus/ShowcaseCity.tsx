/**
 * ShowcaseCity — Procedural 3D city generator for featured bitmap blocks.
 * 
 * Generates highly-detailed buildings on top of the standard Mondrian parcel layout.
 * Each building's style is deterministic (seeded by block height + tx index).
 * 
 * Architecture themes by era:
 *   0-100k:   Ancient (stone, pyramids, temples)
 *   100k-300k: Medieval (castles, towers, cathedrals)
 *   300k-500k: Industrial (brick, smokestacks, warehouses)
 *   500k-700k: Modern (glass towers, steel, clean lines)
 *   700k+:     Cyberpunk (neon, holographic, floating elements)
 */

import { useMemo } from 'react';
import * as THREE from 'three';

// ═══ Featured blocks — 100 curated blocks with surprise cities ═══
// Mix of historically significant + random for discovery
const FEATURED_BLOCKS: Set<number> = new Set([
  // Satoshi era landmarks
  0, 1, 9, 170, 478, 546, 2016,
  // Early milestones
  10000, 20000, 30000, 50000, 57043, 70000,
  // Pizza block & halving blocks
  100000, 150000, 200000, 210000,
  // Growing network
  250000, 277316, 300000, 350000,
  // Second halving era
  400000, 420000, 450000, 478558,
  // SegWit, Taproot era
  481824, 500000, 525000, 550000, 575000,
  // Third halving
  600000, 625000, 630000, 650000,
  // Modern era
  700000, 709632, 720000, 740000, 750000, 760000, 770000,
  // Recent history
  780000, 790000, 800000, 810000, 820000, 830000,
  // Fourth halving
  840000, 841000, 842000, 843000, 844000, 845000,
  // Current era
  850000, 855000, 860000, 865000, 870000, 875000,
  // Random discovery blocks (seeded for surprise)
  12345, 42069, 69420, 77777, 88888, 99999,
  111111, 123456, 222222, 234567, 314159,
  333333, 345678, 404404, 444444, 456789,
  500500, 555555, 567890, 600600, 654321,
  666666, 696969, 700700, 711711, 717317,
  718840, 720143, 738505, 745506, 745966, // Pepe's blocks!
  750750, 777777, 789012, 800800, 808080,
  812345, 823456, 834567, 845678, 856789, 867890,
]);

export function isFeaturedBlock(height: number): boolean {
  return FEATURED_BLOCKS.has(height);
}

// ═══ Seeded random for deterministic generation ═══
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ═══ Era detection ═══
type Era = 'ancient' | 'medieval' | 'industrial' | 'modern' | 'cyberpunk';

function getEra(height: number): Era {
  if (height < 100000) return 'ancient';
  if (height < 300000) return 'medieval';
  if (height < 500000) return 'industrial';
  if (height < 700000) return 'modern';
  return 'cyberpunk';
}

// ═══ Color palettes by era ═══
const ERA_PALETTES: Record<Era, string[]> = {
  ancient: ['#8B7355', '#A0926B', '#D4C5A9', '#6B5B47', '#C4A882', '#E8DCC8'],
  medieval: ['#4A5568', '#6B7B8D', '#8B6F4E', '#A0522D', '#B8860B', '#696969'],
  industrial: ['#8B4513', '#A0522D', '#CD853F', '#D2691E', '#8B0000', '#556B2F'],
  modern: ['#E0E7EE', '#B0BEC5', '#78909C', '#546E7A', '#37474F', '#4FC3F7'],
  cyberpunk: ['#FF006E', '#00F5D4', '#8338EC', '#FFBE0B', '#FB5607', '#3A86FF'],
};

// ═══ Building type definitions ═══
interface BuildingDef {
  type: 'tower' | 'pyramid' | 'dome' | 'cube' | 'cylinder' | 'spire' | 'warehouse' | 'temple';
  heightMult: number;   // multiplier for base height
  widthShrink: number;  // top width as fraction of base (1 = straight, 0.3 = tapered)
  hasAntenna: boolean;
  hasRoofDetail: boolean;
  hasWindows: boolean;
  hasNeon: boolean;
  hasFloatingElements: boolean;
}

function getBuildingDef(era: Era, rng: () => number): BuildingDef {
  const r = rng();
  switch (era) {
    case 'ancient':
      return r < 0.3
        ? { type: 'pyramid', heightMult: 1.5, widthShrink: 0.05, hasAntenna: false, hasRoofDetail: false, hasWindows: false, hasNeon: false, hasFloatingElements: false }
        : r < 0.6
        ? { type: 'temple', heightMult: 0.8, widthShrink: 0.9, hasAntenna: false, hasRoofDetail: true, hasWindows: false, hasNeon: false, hasFloatingElements: false }
        : { type: 'dome', heightMult: 1.0, widthShrink: 0.8, hasAntenna: false, hasRoofDetail: true, hasWindows: false, hasNeon: false, hasFloatingElements: false };
    case 'medieval':
      return r < 0.4
        ? { type: 'tower', heightMult: 2.0, widthShrink: 0.7, hasAntenna: false, hasRoofDetail: true, hasWindows: true, hasNeon: false, hasFloatingElements: false }
        : r < 0.7
        ? { type: 'spire', heightMult: 2.5, widthShrink: 0.15, hasAntenna: false, hasRoofDetail: true, hasWindows: true, hasNeon: false, hasFloatingElements: false }
        : { type: 'cube', heightMult: 1.2, widthShrink: 0.9, hasAntenna: false, hasRoofDetail: true, hasWindows: true, hasNeon: false, hasFloatingElements: false };
    case 'industrial':
      return r < 0.35
        ? { type: 'warehouse', heightMult: 0.6, widthShrink: 1.0, hasAntenna: false, hasRoofDetail: false, hasWindows: true, hasNeon: false, hasFloatingElements: false }
        : r < 0.65
        ? { type: 'cylinder', heightMult: 2.0, widthShrink: 0.9, hasAntenna: true, hasRoofDetail: false, hasWindows: false, hasNeon: false, hasFloatingElements: false }
        : { type: 'cube', heightMult: 1.0, widthShrink: 0.95, hasAntenna: true, hasRoofDetail: false, hasWindows: true, hasNeon: false, hasFloatingElements: false };
    case 'modern':
      return r < 0.4
        ? { type: 'tower', heightMult: 3.0, widthShrink: 0.85, hasAntenna: true, hasRoofDetail: true, hasWindows: true, hasNeon: false, hasFloatingElements: false }
        : r < 0.7
        ? { type: 'cylinder', heightMult: 2.5, widthShrink: 0.9, hasAntenna: true, hasRoofDetail: true, hasWindows: true, hasNeon: false, hasFloatingElements: false }
        : { type: 'cube', heightMult: 1.5, widthShrink: 0.95, hasAntenna: false, hasRoofDetail: true, hasWindows: true, hasNeon: false, hasFloatingElements: false };
    case 'cyberpunk':
      return r < 0.3
        ? { type: 'tower', heightMult: 4.0, widthShrink: 0.7, hasAntenna: true, hasRoofDetail: true, hasWindows: true, hasNeon: true, hasFloatingElements: true }
        : r < 0.6
        ? { type: 'spire', heightMult: 5.0, widthShrink: 0.2, hasAntenna: true, hasRoofDetail: true, hasWindows: true, hasNeon: true, hasFloatingElements: true }
        : { type: 'cylinder', heightMult: 3.0, widthShrink: 0.85, hasAntenna: true, hasRoofDetail: true, hasWindows: true, hasNeon: true, hasFloatingElements: rng() > 0.5 };
  }
}

// ═══ Building geometry generators ═══

interface ShowcaseBuilding {
  position: [number, number, number];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  extras: { geometry: THREE.BufferGeometry; material: THREE.Material; position: [number, number, number] }[];
}

function createBuildingGeometry(
  def: BuildingDef,
  width: number,
  depth: number,
  baseHeight: number,
  era: Era,
  rng: () => number,
  palette: string[]
): ShowcaseBuilding {
  const h = baseHeight * def.heightMult;
  const color = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
  const extras: ShowcaseBuilding['extras'] = [];

  let geom: THREE.BufferGeometry;
  let mat: THREE.Material;

  switch (def.type) {
    case 'pyramid': {
      // Stepped pyramid
      const steps = 3 + Math.floor(rng() * 3);
      geom = new THREE.BoxGeometry(width, h / steps, depth);
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
      // Add steps
      for (let i = 1; i < steps; i++) {
        const scale = 1 - (i / steps) * 0.7;
        const stepH = h / steps;
        const stepGeom = new THREE.BoxGeometry(width * scale, stepH, depth * scale);
        extras.push({
          geometry: stepGeom,
          material: new THREE.MeshStandardMaterial({
            color: color.clone().offsetHSL(0, 0, i * 0.04),
            roughness: 0.8,
            metalness: 0.1,
          }),
          position: [0, (i + 0.5) * stepH, 0],
        });
      }
      break;
    }
    case 'dome': {
      geom = new THREE.BoxGeometry(width, h * 0.6, depth);
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
      // Dome on top
      const domeR = Math.min(width, depth) * 0.45;
      extras.push({
        geometry: new THREE.SphereGeometry(domeR, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        material: new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0.05, 0, 0.1), roughness: 0.4, metalness: 0.3 }),
        position: [0, h * 0.6, 0],
      });
      break;
    }
    case 'cylinder': {
      const r = Math.min(width, depth) * 0.45;
      geom = new THREE.CylinderGeometry(r * def.widthShrink, r, h, 16);
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: era === 'modern' ? 0.2 : 0.7,
        metalness: era === 'modern' ? 0.8 : 0.1,
      });
      break;
    }
    case 'spire': {
      geom = new THREE.ConeGeometry(Math.min(width, depth) * 0.45, h, 8);
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: era === 'cyberpunk' ? 0.9 : 0.3,
      });
      break;
    }
    case 'warehouse': {
      geom = new THREE.BoxGeometry(width, h, depth);
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
      break;
    }
    case 'temple': {
      // Base platform + columns concept (simplified as wide box + thin tall box)
      geom = new THREE.BoxGeometry(width, h * 0.3, depth);
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
      // "Columns" represented as narrower structure on top
      extras.push({
        geometry: new THREE.BoxGeometry(width * 0.8, h * 0.7, depth * 0.8),
        material: new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, -0.1, 0.05), roughness: 0.7 }),
        position: [0, h * 0.5, 0],
      });
      // Roof
      extras.push({
        geometry: new THREE.BoxGeometry(width * 0.95, h * 0.1, depth * 0.95),
        material: new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, 0.1), roughness: 0.6 }),
        position: [0, h * 0.85 + h * 0.05, 0],
      });
      break;
    }
    case 'tower':
    case 'cube':
    default: {
      geom = new THREE.BoxGeometry(width * def.widthShrink, h, depth * def.widthShrink);
      const isGlass = era === 'modern' || era === 'cyberpunk';
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: isGlass ? 0.1 : 0.6,
        metalness: isGlass ? 0.9 : 0.2,
        transparent: isGlass && rng() > 0.5,
        opacity: isGlass ? 0.85 : 1,
      });
      break;
    }
  }

  // ═══ Antenna ═══
  if (def.hasAntenna && rng() > 0.3) {
    const antennaH = h * 0.3 + rng() * h * 0.2;
    extras.push({
      geometry: new THREE.CylinderGeometry(0.01, 0.02, antennaH, 4),
      material: new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.9, roughness: 0.3 }),
      position: [0, h + antennaH / 2, 0],
    });
  }

  // ═══ Roof detail ═══
  if (def.hasRoofDetail && rng() > 0.4) {
    const roofType = rng();
    if (roofType < 0.5) {
      // Water tower / AC unit
      extras.push({
        geometry: new THREE.CylinderGeometry(width * 0.1, width * 0.1, h * 0.1, 8),
        material: new THREE.MeshStandardMaterial({ color: '#555555', roughness: 0.8 }),
        position: [(rng() - 0.5) * width * 0.4, h + h * 0.05, (rng() - 0.5) * depth * 0.4],
      });
    } else {
      // Helipad / flat top accent
      extras.push({
        geometry: new THREE.BoxGeometry(width * 0.3, 0.02, depth * 0.3),
        material: new THREE.MeshStandardMaterial({ color: '#ffff00', emissive: '#444400', roughness: 0.5 }),
        position: [0, h + 0.01, 0],
      });
    }
  }

  // ═══ Neon strips (cyberpunk) ═══
  if (def.hasNeon) {
    const neonColors = ['#FF006E', '#00F5D4', '#8338EC', '#FFBE0B', '#3A86FF'];
    const neonColor = neonColors[Math.floor(rng() * neonColors.length)];
    const strips = 1 + Math.floor(rng() * 3);
    for (let s = 0; s < strips; s++) {
      const stripY = h * 0.2 + rng() * h * 0.7;
      const side = Math.floor(rng() * 4); // 0=front, 1=back, 2=left, 3=right
      const sw = side < 2 ? width * 0.8 : 0.02;
      const sd = side >= 2 ? depth * 0.8 : 0.02;
      const sx = side === 2 ? -width / 2 - 0.01 : side === 3 ? width / 2 + 0.01 : 0;
      const sz = side === 0 ? -depth / 2 - 0.01 : side === 1 ? depth / 2 + 0.01 : 0;
      extras.push({
        geometry: new THREE.BoxGeometry(sw, 0.03, sd),
        material: new THREE.MeshStandardMaterial({
          color: neonColor,
          emissive: neonColor,
          emissiveIntensity: 2,
          roughness: 0,
          metalness: 1,
        }),
        position: [sx, stripY, sz],
      });
    }
  }

  // ═══ Floating elements (cyberpunk) ═══
  if (def.hasFloatingElements && rng() > 0.5) {
    const floatH = h + h * 0.3 + rng() * h * 0.4;
    extras.push({
      geometry: new THREE.OctahedronGeometry(width * 0.15),
      material: new THREE.MeshStandardMaterial({
        color: '#00F5D4',
        emissive: '#00F5D4',
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.7,
      }),
      position: [(rng() - 0.5) * width, floatH, (rng() - 0.5) * depth],
    });
  }

  // ═══ Windows (modern/industrial/medieval) ═══
  if (def.hasWindows) {
    const windowRows = Math.max(2, Math.floor(h / 0.3));
    const windowCols = Math.max(1, Math.floor(width / 0.3));
    const windowColor = era === 'cyberpunk' ? '#FFBE0B' : era === 'modern' ? '#E0F7FA' : '#FFF8E1';
    const windowEmissive = era === 'cyberpunk' ? 0.8 : era === 'modern' ? 0.3 : 0.1;

    // Only add a few representative windows to keep geometry count low
    const maxWindows = 12;
    let windowCount = 0;
    for (let r = 0; r < Math.min(windowRows, 6) && windowCount < maxWindows; r++) {
      for (let c = 0; c < Math.min(windowCols, 4) && windowCount < maxWindows; c++) {
        if (rng() > 0.4) { // Some windows dark
          const wy = 0.2 + (r / windowRows) * h * 0.9;
          const wx = -width * 0.35 + (c / Math.max(windowCols - 1, 1)) * width * 0.7;
          extras.push({
            geometry: new THREE.PlaneGeometry(width * 0.08, 0.12),
            material: new THREE.MeshStandardMaterial({
              color: windowColor,
              emissive: windowColor,
              emissiveIntensity: windowEmissive,
              side: THREE.DoubleSide,
            }),
            position: [wx, wy, -depth / 2 - 0.005],
          });
          windowCount++;
        }
      }
    }
  }

  return {
    position: [0, h / 2, 0],
    geometry: geom,
    material: mat,
    extras,
  };
}

// ═══ Main hook: generate showcase buildings for a block ═══

export interface ShowcaseBuildingData {
  parcelIndex: number;
  position: [number, number, number]; // world position on the parcel
  building: ShowcaseBuilding;
}

export function useShowcaseBuildings(
  blockHeight: number,
  parcels: { txIndex: number; x: number; z: number; width: number; depth: number; bytes: number; isCoinbase: boolean }[]
): ShowcaseBuildingData[] | null {
  return useMemo(() => {
    if (!isFeaturedBlock(blockHeight)) return null;
    if (parcels.length === 0) return null;

    const era = getEra(blockHeight);
    const palette = ERA_PALETTES[era];
    const buildings: ShowcaseBuildingData[] = [];

    for (const parcel of parcels) {
      const rng = seededRng(blockHeight * 7919 + parcel.txIndex * 31337);
      const def = getBuildingDef(era, rng);

      // Building dimensions based on parcel size
      const bWidth = parcel.width * 0.75; // 75% of parcel width
      const bDepth = parcel.depth * 0.75;

      // Height based on tx size — bigger tx = taller building
      const sizeNorm = Math.min(1, parcel.bytes / 5000);
      const baseHeight = 0.3 + sizeNorm * 2.5;

      // Coinbase is always the landmark
      const height = parcel.isCoinbase ? baseHeight * 2.5 : baseHeight;

      const building = createBuildingGeometry(def, bWidth, bDepth, height, era, rng, palette);

      buildings.push({
        parcelIndex: parcel.txIndex,
        position: [parcel.x + parcel.width / 2, 0, parcel.z + parcel.depth / 2],
        building,
      });
    }

    return buildings;
  }, [blockHeight, parcels]);
}

// ═══ React component to render showcase buildings ═══

export function ShowcaseCityRenderer({ buildings }: { buildings: ShowcaseBuildingData[] }) {
  return (
    <group name="showcase-city">
      {buildings.map((b, i) => (
        <group key={i} position={b.position}>
          {/* Main building */}
          <mesh
            position={b.building.position}
            geometry={b.building.geometry}
            material={b.building.material}
            castShadow
            receiveShadow
          />
          {/* Extras (antenna, neon, windows, etc.) */}
          {b.building.extras.map((ex, j) => (
            <mesh
              key={j}
              position={ex.position}
              geometry={ex.geometry}
              material={ex.material}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
