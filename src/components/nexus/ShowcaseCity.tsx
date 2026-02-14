/**
 * ShowcaseCity — Detailed Era-Themed Cities Built ON Bitmap Parcels
 * 
 * Every parcel gets a building. Together they form a cohesive, beautiful city.
 * From above: a stunning planned cityscape matching the Mondrian layout.
 * In street view: intricate details on every building to explore.
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

// ═══ Era System ═══
type Era = 'genesis' | 'ancient' | 'classical' | 'industrial' | 'modern' | 'cyber';

function getEra(h: number): Era {
  if (h < 1000) return 'genesis';
  if (h < 100000) return 'ancient';
  if (h < 300000) return 'classical';
  if (h < 500000) return 'industrial';
  if (h < 700000) return 'modern';
  return 'cyber';
}

interface EraStyle {
  wallColor: string;
  accentColor: string;
  roofColor: string;
  glowColor: string;
  windowColor: string;
  emissive: number;
  metalness: number;
  roughness: number;
  heightMult: number; // era-based height scaling
}

const ERA_STYLES: Record<Era, EraStyle> = {
  genesis: {
    wallColor: '#c8a050', accentColor: '#f7931a', roofColor: '#8b6914',
    glowColor: '#f7931a', windowColor: '#fff8e1', emissive: 0.3,
    metalness: 0.7, roughness: 0.3, heightMult: 0.6,
  },
  ancient: {
    wallColor: '#d4a574', accentColor: '#c8a050', roofColor: '#8b7355',
    glowColor: '#daa520', windowColor: '#ffe4b5', emissive: 0.1,
    metalness: 0.1, roughness: 0.8, heightMult: 0.5,
  },
  classical: {
    wallColor: '#e8e0d0', accentColor: '#b8860b', roofColor: '#8b4513',
    glowColor: '#daa520', windowColor: '#ffefd5', emissive: 0.15,
    metalness: 0.3, roughness: 0.4, heightMult: 0.7,
  },
  industrial: {
    wallColor: '#4a5568', accentColor: '#f7931a', roofColor: '#2d3748',
    glowColor: '#ff6600', windowColor: '#ffd700', emissive: 0.4,
    metalness: 0.8, roughness: 0.4, heightMult: 1.0,
  },
  modern: {
    wallColor: '#cbd5e0', accentColor: '#4fc3f7', roofColor: '#90a4ae',
    glowColor: '#29b6f6', windowColor: '#e1f5fe', emissive: 0.3,
    metalness: 0.9, roughness: 0.1, heightMult: 1.4,
  },
  cyber: {
    wallColor: '#1a1a2e', accentColor: '#00f5d4', roofColor: '#0d0d1a',
    glowColor: '#00f5d4', windowColor: '#00f5d4', emissive: 1.2,
    metalness: 0.95, roughness: 0.05, heightMult: 1.8,
  },
};

// ═══ Building Detail Meshes ═══

interface BuildingMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: [number, number, number];
}

function createBuilding(
  px: number, pz: number, pw: number, pd: number,
  style: EraStyle, rand: () => number, isCoinbase: boolean, bytes: number,
): BuildingMesh[] {
  const meshes: BuildingMesh[] = [];
  const inset = 0.02; // small inset from parcel edges
  const bw = pw - inset * 2;
  const bd = pd - inset * 2;
  const bx = px + pw / 2;
  const bz = pz + pd / 2;

  // Building height based on tx size + era + randomness
  const sizeRatio = Math.min(bytes / 5000, 1);
  const baseH = (0.3 + sizeRatio * 2 + rand() * 1.5) * style.heightMult;
  const h = isCoinbase ? baseH * 2.5 : baseH;
  const minDim = Math.min(bw, bd);

  // ─── Main building body ───
  const wallMat = new THREE.MeshStandardMaterial({
    color: isCoinbase ? style.accentColor : style.wallColor,
    roughness: style.roughness,
    metalness: style.metalness,
    emissive: isCoinbase ? style.glowColor : '#000000',
    emissiveIntensity: isCoinbase ? style.emissive * 0.5 : 0,
  });

  // Building shape varies by era and size
  const shapeRoll = rand();
  if (minDim > 0.4 && shapeRoll < 0.15) {
    // Cylinder (tower)
    meshes.push({
      geometry: new THREE.CylinderGeometry(minDim * 0.4, minDim * 0.45, h, 8),
      material: wallMat,
      position: [bx, h / 2, bz],
    });
  } else if (minDim > 0.5 && shapeRoll < 0.25) {
    // Hexagonal prism
    meshes.push({
      geometry: new THREE.CylinderGeometry(minDim * 0.42, minDim * 0.42, h, 6),
      material: wallMat,
      position: [bx, h / 2, bz],
    });
  } else {
    // Box (most common)
    meshes.push({
      geometry: new THREE.BoxGeometry(bw, h, bd),
      material: wallMat,
      position: [bx, h / 2, bz],
    });
  }

  // ─── Roof / Top detail ───
  if (minDim > 0.2) {
    const roofRoll = rand();
    const roofMat = new THREE.MeshStandardMaterial({
      color: style.roofColor,
      roughness: style.roughness + 0.1,
      metalness: style.metalness * 0.7,
    });

    if (roofRoll < 0.3 && minDim > 0.4) {
      // Pyramid roof
      meshes.push({
        geometry: new THREE.ConeGeometry(minDim * 0.5, h * 0.3, 4),
        material: roofMat,
        position: [bx, h + h * 0.15, bz],
      });
    } else if (roofRoll < 0.5) {
      // Flat roof ledge
      meshes.push({
        geometry: new THREE.BoxGeometry(bw + 0.04, 0.03, bd + 0.04),
        material: roofMat,
        position: [bx, h + 0.015, bz],
      });
    } else if (roofRoll < 0.7 && minDim > 0.3) {
      // Dome
      meshes.push({
        geometry: new THREE.SphereGeometry(minDim * 0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        material: roofMat,
        position: [bx, h, bz],
      });
    }
  }

  // ─── Windows (rows of glowing strips on sides) ───
  if (h > 0.4 && minDim > 0.15) {
    const windowMat = new THREE.MeshStandardMaterial({
      color: style.windowColor,
      emissive: style.windowColor,
      emissiveIntensity: style.emissive * 0.6,
      roughness: 0.1,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    const floors = Math.min(Math.floor(h / 0.25), 12);
    const windowW = bw * 0.6;
    const windowD = bd * 0.6;
    const windowH = 0.04;

    for (let f = 0; f < floors; f++) {
      const fy = 0.15 + f * (h / floors);
      // Front and back windows
      if (rand() > 0.3) {
        meshes.push({
          geometry: new THREE.BoxGeometry(windowW, windowH, 0.005),
          material: windowMat,
          position: [bx, fy, bz + bd / 2 + 0.003],
        });
        meshes.push({
          geometry: new THREE.BoxGeometry(windowW, windowH, 0.005),
          material: windowMat,
          position: [bx, fy, bz - bd / 2 - 0.003],
        });
      }
      // Side windows
      if (rand() > 0.4) {
        meshes.push({
          geometry: new THREE.BoxGeometry(0.005, windowH, windowD),
          material: windowMat,
          position: [bx + bw / 2 + 0.003, fy, bz],
        });
        meshes.push({
          geometry: new THREE.BoxGeometry(0.005, windowH, windowD),
          material: windowMat,
          position: [bx - bw / 2 - 0.003, fy, bz],
        });
      }
    }
  }

  // ─── Antenna / Spire (tall buildings) ───
  if (h > 1.5 && rand() > 0.5) {
    const antennaH = h * 0.25;
    meshes.push({
      geometry: new THREE.CylinderGeometry(0.008, 0.015, antennaH, 4),
      material: new THREE.MeshStandardMaterial({
        color: style.accentColor,
        metalness: 0.9,
        roughness: 0.2,
      }),
      position: [bx, h + antennaH / 2, bz],
    });
    // Blinking light on top
    meshes.push({
      geometry: new THREE.SphereGeometry(0.02, 6, 4),
      material: new THREE.MeshStandardMaterial({
        color: '#ff0000',
        emissive: '#ff0000',
        emissiveIntensity: 2,
      }),
      position: [bx, h + antennaH, bz],
    });
  }

  // ─── Ground-level awning / entrance (medium+ buildings) ───
  if (minDim > 0.3 && h > 0.6 && rand() > 0.5) {
    meshes.push({
      geometry: new THREE.BoxGeometry(bw * 0.4, 0.02, 0.08),
      material: new THREE.MeshStandardMaterial({
        color: style.accentColor,
        roughness: 0.5,
        metalness: 0.3,
      }),
      position: [bx, 0.2, bz + bd / 2 + 0.04],
    });
  }

  // ─── Neon accent strip (cyber/modern eras) ───
  if ((style.emissive > 0.3) && minDim > 0.2 && rand() > 0.4) {
    const stripH = 0.02;
    const stripY = h * (0.3 + rand() * 0.5);
    meshes.push({
      geometry: new THREE.BoxGeometry(bw + 0.01, stripH, bd + 0.01),
      material: new THREE.MeshStandardMaterial({
        color: style.glowColor,
        emissive: style.glowColor,
        emissiveIntensity: style.emissive,
        roughness: 0,
        metalness: 1,
      }),
      position: [bx, stripY, bz],
    });
  }

  // ─── Rooftop AC / mechanical box (industrial+) ───
  if (h > 0.8 && minDim > 0.3 && rand() > 0.6) {
    const boxS = minDim * 0.2;
    const ox = (rand() - 0.5) * bw * 0.3;
    const oz = (rand() - 0.5) * bd * 0.3;
    meshes.push({
      geometry: new THREE.BoxGeometry(boxS, boxS * 0.6, boxS),
      material: new THREE.MeshStandardMaterial({
        color: '#666666',
        roughness: 0.7,
        metalness: 0.5,
      }),
      position: [bx + ox, h + boxS * 0.3, bz + oz],
    });
  }

  // ─── Coinbase landmark extras ───
  if (isCoinbase) {
    // Glowing orb above
    meshes.push({
      geometry: new THREE.SphereGeometry(minDim * 0.3, 16, 12),
      material: new THREE.MeshStandardMaterial({
        color: style.accentColor,
        emissive: style.glowColor,
        emissiveIntensity: style.emissive * 2,
        roughness: 0,
        metalness: 1,
        transparent: true,
        opacity: 0.8,
      }),
      position: [bx, h + minDim * 0.5, bz],
    });

    // Base glow ring
    meshes.push({
      geometry: new THREE.RingGeometry(minDim * 0.3, minDim * 0.55, 32),
      material: new THREE.MeshStandardMaterial({
        color: style.glowColor,
        emissive: style.glowColor,
        emissiveIntensity: style.emissive,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      }),
      position: [bx, 0.005, bz],
    });

    // 4 pillars at corners
    const pillarR = minDim * 0.04;
    const pillarH = h * 0.6;
    for (let c = 0; c < 4; c++) {
      const cx2 = bx + (c < 2 ? -1 : 1) * bw * 0.45;
      const cz2 = bz + (c % 2 === 0 ? -1 : 1) * bd * 0.45;
      meshes.push({
        geometry: new THREE.CylinderGeometry(pillarR, pillarR, pillarH, 6),
        material: new THREE.MeshStandardMaterial({
          color: style.accentColor,
          emissive: style.glowColor,
          emissiveIntensity: style.emissive * 0.3,
          metalness: 0.8,
          roughness: 0.2,
        }),
        position: [cx2, pillarH / 2, cz2],
      });
    }
  }

  return meshes;
}

// ═══ Main Generator ═══

export interface ShowcaseBuildingData {
  parcelIndex: number;
  position: [number, number, number];
  building: {
    position: [number, number, number];
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    extras: { geometry: THREE.BufferGeometry; material: THREE.Material; position: [number, number, number] }[];
  };
}

export function useShowcaseBuildings(
  blockHeight: number,
  parcels: { txIndex: number; x: number; z: number; width: number; depth: number; bytes: number; isCoinbase: boolean }[]
): ShowcaseBuildingData[] | null {
  return useMemo(() => {
    if (!isFeaturedBlock(blockHeight)) return null;
    if (parcels.length === 0) return null;

    const era = getEra(blockHeight);
    const style = ERA_STYLES[era];
    const rand = rng(blockHeight * 31337);

    const allMeshes: BuildingMesh[] = [];

    // Build on EVERY parcel
    for (const p of parcels) {
      const building = createBuilding(
        p.x, p.z, p.width, p.depth,
        style, rand, p.isCoinbase, p.bytes
      );
      allMeshes.push(...building);
    }

    // Convert to ShowcaseBuildingData format
    return allMeshes.map((mesh, i) => ({
      parcelIndex: i,
      position: [0, 0, 0] as [number, number, number],
      building: {
        position: mesh.position,
        geometry: mesh.geometry,
        material: mesh.material,
        extras: [],
      },
    }));
  }, [blockHeight, parcels]);
}

// ═══ Renderer ═══

export function ShowcaseCityRenderer({ buildings }: { buildings: ShowcaseBuildingData[] }) {
  return (
    <group name="showcase-city">
      {buildings.map((b, i) => (
        <mesh
          key={i}
          position={b.building.position}
          geometry={b.building.geometry}
          material={b.building.material}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
