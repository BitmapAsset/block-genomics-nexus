'use client';
import React, { useMemo } from 'react';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════════════
   World Prefabs — Self-contained Three.js primitive compositions
   Each prefab is a <group> of meshes. No external assets.
   ═══════════════════════════════════════════════════════════════════════════ */

const MAT = {
  wood: { color: '#8B5A2B', roughness: 0.9, metalness: 0.05 },
  darkWood: { color: '#5C3A1E', roughness: 0.9, metalness: 0.05 },
  leaf: { color: '#3CB043', roughness: 0.8, metalness: 0 },
  darkLeaf: { color: '#2E8B34', roughness: 0.8, metalness: 0 },
  pineLeaf: { color: '#1A5C2A', roughness: 0.7, metalness: 0 },
  cherryLeaf: { color: '#FFB7C5', roughness: 0.7, metalness: 0 },
  palmLeaf: { color: '#4CAF50', roughness: 0.7, metalness: 0 },
  stone: { color: '#9E9E9E', roughness: 0.85, metalness: 0.1 },
  darkStone: { color: '#6B6B6B', roughness: 0.9, metalness: 0.1 },
  metal: { color: '#B0B0B0', roughness: 0.3, metalness: 0.8 },
  darkMetal: { color: '#4A4A4A', roughness: 0.4, metalness: 0.9 },
  water: { color: '#4FC3F7', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 },
  grass: { color: '#7CFC00', roughness: 0.95, metalness: 0 },
  dirt: { color: '#8B7355', roughness: 0.95, metalness: 0 },
  red: { color: '#E53935', roughness: 0.7, metalness: 0 },
  yellow: { color: '#FDD835', roughness: 0.7, metalness: 0 },
  orange: { color: '#FF9800', roughness: 0.7, metalness: 0 },
  white: { color: '#FAFAFA', roughness: 0.6, metalness: 0.1 },
  cream: { color: '#FFF8E1', roughness: 0.7, metalness: 0.05 },
  brick: { color: '#C0392B', roughness: 0.85, metalness: 0.05 },
  glass: { color: '#81D4FA', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
  fabric: { color: '#E91E63', roughness: 0.95, metalness: 0 },
  gold: { color: '#FFD700', roughness: 0.3, metalness: 0.9 },
};

function M(props: Record<string, any>) {
  return <meshStandardMaterial {...props} />;
}

/* ─── NATURE ─── */

function TreeOak() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.15, 0.2, 3, 8]} /><M {...MAT.wood} /></mesh>
      <mesh position={[0, 3.5, 0]} castShadow><sphereGeometry args={[1.3, 12, 10]} /><M {...MAT.leaf} /></mesh>
      <mesh position={[0.6, 3, 0.4]} castShadow><sphereGeometry args={[0.8, 10, 8]} /><M {...MAT.darkLeaf} /></mesh>
      <mesh position={[-0.5, 3.2, -0.3]} castShadow><sphereGeometry args={[0.7, 10, 8]} /><M {...MAT.darkLeaf} /></mesh>
    </group>
  );
}

function TreePine() {
  return (
    <group>
      <mesh position={[0, 1, 0]} castShadow><cylinderGeometry args={[0.12, 0.18, 2, 8]} /><M {...MAT.darkWood} /></mesh>
      <mesh position={[0, 3.5, 0]} castShadow><coneGeometry args={[0.6, 2, 8]} /><M {...MAT.pineLeaf} /></mesh>
      <mesh position={[0, 2.5, 0]} castShadow><coneGeometry args={[0.9, 2, 8]} /><M {...MAT.pineLeaf} /></mesh>
      <mesh position={[0, 1.8, 0]} castShadow><coneGeometry args={[1.1, 1.5, 8]} /><M {...MAT.pineLeaf} /></mesh>
    </group>
  );
}

function TreePalm() {
  return (
    <group>
      <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.12, 0.18, 4, 8]} /><M {...MAT.wood} /></mesh>
      {/* Fronds as flattened cones */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <mesh key={i} position={[Math.sin(angle * Math.PI / 180) * 0.8, 4, Math.cos(angle * Math.PI / 180) * 0.8]}
          rotation={[0.8 * Math.cos(angle * Math.PI / 180), angle * Math.PI / 180, 0.8 * Math.sin(angle * Math.PI / 180)]} castShadow>
          <boxGeometry args={[0.15, 1.8, 0.6]} /><M {...MAT.palmLeaf} />
        </mesh>
      ))}
      {/* Coconuts */}
      <mesh position={[0.15, 3.8, 0.1]} castShadow><sphereGeometry args={[0.12, 8, 8]} /><M {...MAT.wood} /></mesh>
    </group>
  );
}

function TreeCherryBlossom() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.12, 0.18, 3, 8]} /><M {...MAT.darkWood} /></mesh>
      <mesh position={[0, 3.5, 0]} castShadow><sphereGeometry args={[1.4, 12, 10]} /><M {...MAT.cherryLeaf} /></mesh>
      <mesh position={[0.7, 3, 0.5]} castShadow><sphereGeometry args={[0.7, 10, 8]} /><M {...MAT.cherryLeaf} /></mesh>
      <mesh position={[-0.6, 3.3, -0.4]} castShadow><sphereGeometry args={[0.6, 10, 8]} /><M {...MAT.cherryLeaf} /></mesh>
    </group>
  );
}

function Bush() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow><sphereGeometry args={[0.6, 10, 8]} /><M {...MAT.leaf} /></mesh>
      <mesh position={[0.3, 0.3, 0.2]} castShadow><sphereGeometry args={[0.4, 8, 6]} /><M {...MAT.darkLeaf} /></mesh>
      <mesh position={[-0.25, 0.35, -0.15]} castShadow><sphereGeometry args={[0.35, 8, 6]} /><M {...MAT.darkLeaf} /></mesh>
    </group>
  );
}

function FlowerRose() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.02, 0.02, 0.6, 6]} /><M color="#2E7D32" roughness={0.8} /></mesh>
      <mesh position={[0, 0.65, 0]} castShadow><sphereGeometry args={[0.12, 8, 8]} /><M {...MAT.red} /></mesh>
      {/* Petals */}
      <mesh position={[0.08, 0.6, 0]} castShadow><sphereGeometry args={[0.08, 6, 6]} /><M color="#F44336" roughness={0.6} /></mesh>
      <mesh position={[-0.08, 0.6, 0]} castShadow><sphereGeometry args={[0.08, 6, 6]} /><M color="#EF5350" roughness={0.6} /></mesh>
    </group>
  );
}

function FlowerTulip() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.02, 0.02, 0.5, 6]} /><M color="#2E7D32" roughness={0.8} /></mesh>
      <mesh position={[0, 0.55, 0]} castShadow><coneGeometry args={[0.1, 0.2, 8]} /><M {...MAT.yellow} /></mesh>
    </group>
  );
}

function FlowerSunflower() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.03, 0.03, 1, 6]} /><M color="#2E7D32" roughness={0.8} /></mesh>
      <mesh position={[0, 1.05, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.06, 12]} /><M color="#5D4037" roughness={0.9} /></mesh>
      {/* Petals ring */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
        <mesh key={i} position={[Math.sin(a * Math.PI / 180) * 0.25, 1.05, Math.cos(a * Math.PI / 180) * 0.25]} castShadow>
          <boxGeometry args={[0.08, 0.06, 0.15]} /><M {...MAT.yellow} />
        </mesh>
      ))}
    </group>
  );
}

function GrassPatch() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow><cylinderGeometry args={[0.8, 0.8, 0.04, 12]} /><M {...MAT.grass} /></mesh>
      {/* Grass blades */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const r = 0.3 + Math.random() * 0.3;
        return (
          <mesh key={i} position={[Math.sin(a) * r, 0.15, Math.cos(a) * r]} rotation={[0.1 * Math.sin(a), 0, 0.1 * Math.cos(a)]} castShadow>
            <boxGeometry args={[0.03, 0.3, 0.01]} /><M color="#4CAF50" roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

function Pond() {
  return (
    <group>
      <mesh position={[0, -0.05, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 24]} /><M {...MAT.water} side={THREE.DoubleSide} />
      </mesh>
      {/* Stone border */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
        <mesh key={i} position={[Math.sin(a * Math.PI / 180) * 1.5, 0.08, Math.cos(a * Math.PI / 180) * 1.5]} castShadow>
          <sphereGeometry args={[0.15, 6, 6]} /><M {...MAT.stone} />
        </mesh>
      ))}
    </group>
  );
}

function Rock() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow><sphereGeometry args={[0.45, 7, 6]} /><M {...MAT.stone} /></mesh>
      <mesh position={[0.2, 0.15, 0.15]} castShadow><sphereGeometry args={[0.25, 6, 5]} /><M {...MAT.darkStone} /></mesh>
    </group>
  );
}

function Log() {
  return (
    <group>
      <mesh position={[0, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 1.5, 8]} /><M {...MAT.wood} />
      </mesh>
      {/* End rings */}
      <mesh position={[0.75, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <circleGeometry args={[0.15, 8]} /><M {...MAT.darkWood} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ─── PARK ─── */

function Bench() {
  return (
    <group>
      {/* Seat */}
      <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.2, 0.06, 0.4]} /><M {...MAT.wood} /></mesh>
      {/* Back */}
      <mesh position={[0, 0.75, -0.18]} castShadow><boxGeometry args={[1.2, 0.5, 0.04]} /><M {...MAT.wood} /></mesh>
      {/* Legs */}
      {[-0.5, 0.5].map(x => (
        <React.Fragment key={x}>
          <mesh position={[x, 0.22, 0.15]} castShadow><boxGeometry args={[0.06, 0.44, 0.06]} /><M {...MAT.darkMetal} /></mesh>
          <mesh position={[x, 0.22, -0.15]} castShadow><boxGeometry args={[0.06, 0.44, 0.06]} /><M {...MAT.darkMetal} /></mesh>
        </React.Fragment>
      ))}
    </group>
  );
}

function PathStone() {
  return (
    <group>
      {[[-0.3, 0, 0], [0.3, 0, 0.1], [0, 0, 0.5], [-0.2, 0, -0.4], [0.25, 0, -0.3]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, i * 0.5]} receiveShadow>
          <circleGeometry args={[0.2 + i * 0.02, 6]} /><M {...MAT.stone} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function PathDirt() {
  return (
    <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1, 2]} /><M {...MAT.dirt} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Fountain() {
  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[1, 1.1, 0.4, 16]} /><M {...MAT.stone} /></mesh>
      {/* Bowl */}
      <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.8, 0.9, 0.2, 16]} /><M {...MAT.stone} /></mesh>
      {/* Water */}
      <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.75, 0.75, 0.08, 16]} /><M {...MAT.water} /></mesh>
      {/* Center column */}
      <mesh position={[0, 1, 0]} castShadow><cylinderGeometry args={[0.08, 0.1, 1, 8]} /><M {...MAT.stone} /></mesh>
      {/* Top */}
      <mesh position={[0, 1.5, 0]} castShadow><sphereGeometry args={[0.15, 8, 8]} /><M {...MAT.water} /></mesh>
    </group>
  );
}

function LampPost() {
  return (
    <group>
      {/* Pole */}
      <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.05, 0.07, 3, 8]} /><M {...MAT.darkMetal} /></mesh>
      {/* Light housing */}
      <mesh position={[0, 3.1, 0]} castShadow><boxGeometry args={[0.3, 0.2, 0.3]} /><M {...MAT.darkMetal} /></mesh>
      {/* Bulb glow */}
      <mesh position={[0, 3, 0]}><sphereGeometry args={[0.1, 8, 8]} /><meshBasicMaterial color="#FFF9C4" /></mesh>
      <pointLight position={[0, 3, 0]} color="#FFF9C4" intensity={0.8} distance={8} />
    </group>
  );
}

function Fence() {
  return (
    <group>
      {/* Rails */}
      <mesh position={[0, 0.35, 0]} castShadow><boxGeometry args={[2, 0.06, 0.04]} /><M {...MAT.wood} /></mesh>
      <mesh position={[0, 0.65, 0]} castShadow><boxGeometry args={[2, 0.06, 0.04]} /><M {...MAT.wood} /></mesh>
      {/* Posts */}
      {[-0.9, -0.3, 0.3, 0.9].map(x => (
        <mesh key={x} position={[x, 0.4, 0]} castShadow><boxGeometry args={[0.06, 0.8, 0.06]} /><M {...MAT.wood} /></mesh>
      ))}
    </group>
  );
}

function Gate() {
  return (
    <group>
      {/* Posts */}
      {[-0.6, 0.6].map(x => (
        <mesh key={x} position={[x, 0.6, 0]} castShadow><boxGeometry args={[0.1, 1.2, 0.1]} /><M {...MAT.darkMetal} /></mesh>
      ))}
      {/* Top bar */}
      <mesh position={[0, 1.2, 0]} castShadow><boxGeometry args={[1.2, 0.06, 0.06]} /><M {...MAT.darkMetal} /></mesh>
      {/* Bars */}
      {[-0.35, 0, 0.35].map(x => (
        <mesh key={x} position={[x, 0.55, 0]} castShadow><cylinderGeometry args={[0.02, 0.02, 1.1, 6]} /><M {...MAT.darkMetal} /></mesh>
      ))}
    </group>
  );
}

function Gazebo() {
  return (
    <group>
      {/* Floor */}
      <mesh position={[0, 0.05, 0]} receiveShadow><cylinderGeometry args={[1.5, 1.5, 0.1, 6]} /><M {...MAT.wood} /></mesh>
      {/* Pillars */}
      {[0, 60, 120, 180, 240, 300].map((a, i) => (
        <mesh key={i} position={[Math.sin(a * Math.PI / 180) * 1.3, 1.2, Math.cos(a * Math.PI / 180) * 1.3]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 2.3, 8]} /><M {...MAT.white} />
        </mesh>
      ))}
      {/* Roof */}
      <mesh position={[0, 2.6, 0]} castShadow><coneGeometry args={[1.8, 0.8, 6]} /><M color="#8D6E63" roughness={0.8} /></mesh>
    </group>
  );
}

function Bridge() {
  return (
    <group>
      {/* Deck */}
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[1.2, 0.08, 3]} /><M {...MAT.wood} /></mesh>
      {/* Railings */}
      {[-0.55, 0.55].map(x => (
        <React.Fragment key={x}>
          <mesh position={[x, 0.55, 0]} castShadow><boxGeometry args={[0.04, 0.5, 3]} /><M {...MAT.wood} /></mesh>
          {[-1, 0, 1].map(z => (
            <mesh key={z} position={[x, 0.45, z]} castShadow><boxGeometry args={[0.04, 0.3, 0.04]} /><M {...MAT.wood} /></mesh>
          ))}
        </React.Fragment>
      ))}
    </group>
  );
}

/* ─── URBAN ─── */

function BuildingSmall() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[2, 3, 2]} /><M {...MAT.cream} /></mesh>
      {/* Door */}
      <mesh position={[0, 0.5, 1.01]} castShadow><boxGeometry args={[0.5, 1, 0.02]} /><M {...MAT.wood} /></mesh>
      {/* Windows */}
      {[[-0.5, 1.8], [0.5, 1.8], [-0.5, 2.5], [0.5, 2.5]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 1.01]} castShadow><boxGeometry args={[0.35, 0.35, 0.02]} /><M {...MAT.glass} /></mesh>
      ))}
      {/* Roof */}
      <mesh position={[0, 3.3, 0]} castShadow><boxGeometry args={[2.2, 0.15, 2.2]} /><M {...MAT.darkStone} /></mesh>
    </group>
  );
}

function BuildingTall() {
  return (
    <group>
      <mesh position={[0, 3.5, 0]} castShadow><boxGeometry args={[2, 7, 2]} /><M {...MAT.stone} /></mesh>
      {/* Windows grid */}
      {[1.5, 2.5, 3.5, 4.5, 5.5, 6.2].map((y, yi) =>
        [-0.5, 0.5].map((x, xi) => (
          <mesh key={`${yi}-${xi}`} position={[x, y, 1.01]} castShadow>
            <boxGeometry args={[0.35, 0.4, 0.02]} /><M {...MAT.glass} />
          </mesh>
        ))
      )}
      {/* Door */}
      <mesh position={[0, 0.6, 1.01]} castShadow><boxGeometry args={[0.6, 1.2, 0.02]} /><M {...MAT.darkMetal} /></mesh>
      {/* Roof structure */}
      <mesh position={[0, 7.15, 0]} castShadow><boxGeometry args={[2.1, 0.3, 2.1]} /><M {...MAT.darkStone} /></mesh>
    </group>
  );
}

function Shop() {
  return (
    <group>
      <mesh position={[0, 1, 0]} castShadow><boxGeometry args={[2.5, 2, 2]} /><M {...MAT.cream} /></mesh>
      {/* Awning */}
      <mesh position={[0, 1.8, 1.3]} rotation={[0.3, 0, 0]} castShadow><boxGeometry args={[2.6, 0.05, 0.8]} /><M {...MAT.fabric} /></mesh>
      {/* Shopfront window */}
      <mesh position={[0, 0.8, 1.01]} castShadow><boxGeometry args={[1.8, 1.2, 0.02]} /><M {...MAT.glass} /></mesh>
      {/* Door */}
      <mesh position={[0.7, 0.5, 1.01]} castShadow><boxGeometry args={[0.4, 1, 0.02]} /><M {...MAT.wood} /></mesh>
    </group>
  );
}

function Sign() {
  return (
    <group>
      {/* Post */}
      <mesh position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 1.6, 6]} /><M {...MAT.darkMetal} /></mesh>
      {/* Board */}
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[0.8, 0.4, 0.04]} /><M {...MAT.white} /></mesh>
    </group>
  );
}

function Mailbox() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.03, 0.04, 1, 6]} /><M {...MAT.darkMetal} /></mesh>
      <mesh position={[0, 1, 0]} castShadow><boxGeometry args={[0.3, 0.25, 0.2]} /><M color="#1565C0" roughness={0.6} metalness={0.3} /></mesh>
    </group>
  );
}

function TrashCan() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.2, 0.22, 0.7, 10]} /><M {...MAT.darkStone} /></mesh>
      <mesh position={[0, 0.72, 0]} castShadow><cylinderGeometry args={[0.22, 0.22, 0.04, 10]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function FireHydrant() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.12, 0.15, 0.6, 8]} /><M {...MAT.red} /></mesh>
      <mesh position={[0, 0.65, 0]} castShadow><sphereGeometry args={[0.13, 8, 8]} /><M {...MAT.red} /></mesh>
      {/* Side nozzles */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * 0.18, 0.35, 0]} rotation={[0, 0, s * Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.12, 6]} /><M {...MAT.red} />
        </mesh>
      ))}
    </group>
  );
}

/* ─── DECORATIVE ─── */

function Statue() {
  return (
    <group>
      {/* Pedestal */}
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.8, 0.6, 0.8]} /><M {...MAT.stone} /></mesh>
      {/* Body */}
      <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.2, 0.25, 1.2, 8]} /><M {...MAT.stone} /></mesh>
      {/* Head */}
      <mesh position={[0, 2, 0]} castShadow><sphereGeometry args={[0.2, 8, 8]} /><M {...MAT.stone} /></mesh>
    </group>
  );
}

function Flag() {
  return (
    <group>
      {/* Pole */}
      <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.03, 0.03, 3, 6]} /><M {...MAT.metal} /></mesh>
      {/* Flag cloth */}
      <mesh position={[0.35, 2.6, 0]} castShadow><boxGeometry args={[0.7, 0.45, 0.02]} /><M {...MAT.fabric} /></mesh>
      {/* Topper */}
      <mesh position={[0, 3.05, 0]} castShadow><sphereGeometry args={[0.05, 6, 6]} /><M {...MAT.gold} /></mesh>
    </group>
  );
}

function Banner() {
  return (
    <group>
      {/* Bar */}
      <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.03, 0.03, 1, 6]} /><M {...MAT.darkMetal} /></mesh>
      {/* Fabric */}
      <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[0.8, 1, 0.02]} /><M {...MAT.orange} /></mesh>
    </group>
  );
}

function Planter() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.35, 0.3, 0.5, 8]} /><M color="#795548" roughness={0.9} /></mesh>
      <mesh position={[0, 0.55, 0]} castShadow><sphereGeometry args={[0.3, 8, 8]} /><M {...MAT.leaf} /></mesh>
      <mesh position={[0.15, 0.65, 0.1]} castShadow><sphereGeometry args={[0.08, 6, 6]} /><M {...MAT.red} /></mesh>
    </group>
  );
}

function HedgeWall() {
  return (
    <mesh position={[0, 0.5, 0]} castShadow>
      <boxGeometry args={[2, 1, 0.5]} /><M {...MAT.darkLeaf} />
    </mesh>
  );
}

function Arch() {
  return (
    <group>
      {/* Pillars */}
      {[-0.6, 0.6].map(x => (
        <mesh key={x} position={[x, 1, 0]} castShadow><boxGeometry args={[0.15, 2, 0.15]} /><M {...MAT.stone} /></mesh>
      ))}
      {/* Arch top - use a flattened torus segment approximated by a box */}
      <mesh position={[0, 2.1, 0]} castShadow><boxGeometry args={[1.35, 0.2, 0.2]} /><M {...MAT.stone} /></mesh>
      <mesh position={[0, 2.25, 0]} castShadow><boxGeometry args={[1, 0.1, 0.15]} /><M {...MAT.stone} /></mesh>
    </group>
  );
}

function Pergola() {
  return (
    <group>
      {/* 4 posts */}
      {[[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.2, z]} castShadow><boxGeometry args={[0.1, 2.4, 0.1]} /><M {...MAT.wood} /></mesh>
      ))}
      {/* Cross beams */}
      {[-0.6, 0, 0.6].map(z => (
        <mesh key={z} position={[0, 2.4, z]} castShadow><boxGeometry args={[2.2, 0.08, 0.06]} /><M {...MAT.wood} /></mesh>
      ))}
      {/* Slats */}
      {[-0.8, -0.4, 0, 0.4, 0.8].map(x => (
        <mesh key={x} position={[x, 2.45, 0]} castShadow><boxGeometry args={[0.04, 0.04, 1.4]} /><M {...MAT.wood} /></mesh>
      ))}
    </group>
  );
}

/* ─── INDUSTRIAL ─── */

function Factory() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[4, 3, 3]} /><M {...MAT.stone} /></mesh>
      <mesh position={[-1.2, 3.5, 0]} castShadow><cylinderGeometry args={[0.3, 0.4, 2, 8]} /><M {...MAT.darkStone} /></mesh>
      <mesh position={[1.2, 3, 0]} castShadow><cylinderGeometry args={[0.25, 0.35, 1.5, 8]} /><M {...MAT.darkStone} /></mesh>
      <mesh position={[0, 2.8, 1.51]} castShadow><boxGeometry args={[1.5, 0.8, 0.02]} /><M {...MAT.glass} /></mesh>
      <mesh position={[0, 3.1, 0]} castShadow><boxGeometry args={[4.2, 0.15, 3.2]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Warehouse() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[5, 3, 3.5]} /><M {...MAT.metal} /></mesh>
      <mesh position={[0, 3.3, 0]} castShadow><boxGeometry args={[5.2, 0.8, 3.7]} /><M {...MAT.darkMetal} /></mesh>
      <mesh position={[2, 0.8, 1.76]} castShadow><boxGeometry args={[1.5, 1.6, 0.02]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Crane() {
  return (
    <group>
      <mesh position={[0, 4, 0]} castShadow><boxGeometry args={[0.3, 8, 0.3]} /><M {...MAT.yellow} /></mesh>
      <mesh position={[2, 8, 0]} castShadow><boxGeometry args={[4.5, 0.25, 0.25]} /><M {...MAT.yellow} /></mesh>
      <mesh position={[-1.5, 8, 0]} castShadow><boxGeometry args={[2, 0.25, 0.25]} /><M {...MAT.yellow} /></mesh>
      <mesh position={[3.5, 6, 0]} castShadow><cylinderGeometry args={[0.02, 0.02, 4, 4]} /><M {...MAT.darkMetal} /></mesh>
      <mesh position={[0, 8.5, 0]} castShadow><boxGeometry args={[0.4, 0.6, 0.4]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Smokestack() {
  return (
    <group>
      <mesh position={[0, 3, 0]} castShadow><cylinderGeometry args={[0.4, 0.6, 6, 12]} /><M {...MAT.brick} /></mesh>
      <mesh position={[0, 6.1, 0]} castShadow><cylinderGeometry args={[0.5, 0.4, 0.3, 12]} /><M {...MAT.darkStone} /></mesh>
    </group>
  );
}

function WaterTower() {
  return (
    <group>
      {[[-0.6, 0, -0.6], [0.6, 0, -0.6], [-0.6, 0, 0.6], [0.6, 0, 0.6]].map(([x, _, z], i) => (
        <mesh key={i} position={[x, 2, z]} castShadow><cylinderGeometry args={[0.06, 0.08, 4, 6]} /><M {...MAT.darkMetal} /></mesh>
      ))}
      <mesh position={[0, 4.5, 0]} castShadow><cylinderGeometry args={[1, 0.8, 1.5, 12]} /><M {...MAT.metal} /></mesh>
      <mesh position={[0, 5.4, 0]} castShadow><coneGeometry args={[1.1, 0.5, 12]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Windmill() {
  return (
    <group>
      <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.5, 0.8, 4, 8]} /><M {...MAT.white} /></mesh>
      {[0, 90, 180, 270].map((a, i) => (
        <mesh key={i} position={[Math.sin(a * Math.PI / 180) * 1.5, 4, Math.cos(a * Math.PI / 180) * 0.1]}
          rotation={[0, 0, a * Math.PI / 180]} castShadow>
          <boxGeometry args={[0.15, 3, 0.04]} /><M {...MAT.white} />
        </mesh>
      ))}
      <mesh position={[0, 4, 0.3]} castShadow><sphereGeometry args={[0.15, 8, 8]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function SolarPanel() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} rotation={[-0.4, 0, 0]} castShadow>
        <boxGeometry args={[2, 0.05, 1.2]} /><M color="#1a237e" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.04, 0.04, 0.5, 6]} /><M {...MAT.metal} /></mesh>
    </group>
  );
}

/* ─── RESIDENTIAL ─── */

function HouseSmall() {
  return (
    <group>
      <mesh position={[0, 1, 0]} castShadow><boxGeometry args={[2.5, 2, 2]} /><M {...MAT.cream} /></mesh>
      <mesh position={[0, 2.4, 0]} castShadow><boxGeometry args={[2.8, 0.1, 2.3]} /><M {...MAT.darkWood} /></mesh>
      <mesh position={[0, 2.8, 0]} rotation={[0, 0, 0]} castShadow><cylinderGeometry args={[0, 1.8, 1, 4]} /><M color="#8D6E63" roughness={0.85} /></mesh>
      <mesh position={[0, 0.5, 1.01]} castShadow><boxGeometry args={[0.4, 1, 0.02]} /><M {...MAT.wood} /></mesh>
      {[[-0.7, 1.3], [0.7, 1.3]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 1.01]} castShadow><boxGeometry args={[0.35, 0.35, 0.02]} /><M {...MAT.glass} /></mesh>
      ))}
    </group>
  );
}

function HouseModern() {
  return (
    <group>
      <mesh position={[0, 1, 0]} castShadow><boxGeometry args={[3, 2, 2.5]} /><M {...MAT.white} /></mesh>
      <mesh position={[1, 1.5, 0]} castShadow><boxGeometry args={[1.5, 1, 2.5]} /><M color="#424242" roughness={0.4} metalness={0.3} /></mesh>
      <mesh position={[-0.5, 0.8, 1.26]} castShadow><boxGeometry args={[1.5, 1.4, 0.02]} /><M {...MAT.glass} /></mesh>
      <mesh position={[0, 2.1, 0]} castShadow><boxGeometry args={[3.2, 0.08, 2.7]} /><M color="#424242" roughness={0.3} metalness={0.5} /></mesh>
    </group>
  );
}

function Apartment() {
  return (
    <group>
      <mesh position={[0, 4, 0]} castShadow><boxGeometry args={[3, 8, 2.5]} /><M {...MAT.cream} /></mesh>
      {Array.from({ length: 6 }).map((_, floor) =>
        [-0.8, 0, 0.8].map((x, xi) => (
          <mesh key={`${floor}-${xi}`} position={[x, floor * 1.2 + 1, 1.26]} castShadow>
            <boxGeometry args={[0.5, 0.6, 0.02]} /><M {...MAT.glass} />
          </mesh>
        ))
      )}
      <mesh position={[0, 0.6, 1.26]} castShadow><boxGeometry args={[0.6, 1.2, 0.02]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Cottage() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow><boxGeometry args={[2, 1.6, 1.8]} /><M {...MAT.wood} /></mesh>
      <mesh position={[0, 1.9, 0]} castShadow><cylinderGeometry args={[0, 1.4, 0.8, 4]} /><M color="#5D4037" roughness={0.9} /></mesh>
      <mesh position={[0, 0.4, 0.91]} castShadow><boxGeometry args={[0.35, 0.8, 0.02]} /><M {...MAT.darkWood} /></mesh>
      <mesh position={[0.6, 0.9, 0.91]} castShadow><boxGeometry args={[0.3, 0.3, 0.02]} /><M {...MAT.glass} /></mesh>
    </group>
  );
}

function Cabin() {
  return (
    <group>
      <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[2.5, 1.4, 2]} /><M {...MAT.darkWood} /></mesh>
      <mesh position={[0, 1.7, 0]} castShadow><cylinderGeometry args={[0, 1.6, 0.9, 4]} /><M {...MAT.darkWood} /></mesh>
      <mesh position={[0.9, 2.2, 0.5]} castShadow><boxGeometry args={[0.3, 1.2, 0.3]} /><M {...MAT.stone} /></mesh>
      <mesh position={[0, 0.4, 1.01]} castShadow><boxGeometry args={[0.4, 0.8, 0.02]} /><M {...MAT.wood} /></mesh>
    </group>
  );
}

/* ─── COMMERCIAL ─── */

function OfficeTower() {
  return (
    <group>
      <mesh position={[0, 5, 0]} castShadow><boxGeometry args={[2.5, 10, 2.5]} /><M color="#607D8B" roughness={0.3} metalness={0.6} /></mesh>
      {Array.from({ length: 8 }).map((_, floor) =>
        [-0.7, 0.7].map((x, xi) => (
          <mesh key={`${floor}-${xi}`} position={[x, floor * 1.1 + 1, 1.26]} castShadow>
            <boxGeometry args={[0.5, 0.7, 0.02]} /><M {...MAT.glass} />
          </mesh>
        ))
      )}
      <mesh position={[0, 10.2, 0]} castShadow><boxGeometry args={[2.7, 0.3, 2.7]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Restaurant() {
  return (
    <group>
      <mesh position={[0, 1, 0]} castShadow><boxGeometry args={[3, 2, 2.5]} /><M {...MAT.brick} /></mesh>
      <mesh position={[0, 1.7, 1.4]} rotation={[0.3, 0, 0]} castShadow><boxGeometry args={[3.2, 0.04, 0.8]} /><M {...MAT.red} /></mesh>
      <mesh position={[0, 0.7, 1.26]} castShadow><boxGeometry args={[2, 1.2, 0.02]} /><M {...MAT.glass} /></mesh>
      <mesh position={[0, 2.15, 1.26]} castShadow><boxGeometry args={[1.2, 0.3, 0.04]} /><M {...MAT.yellow} /></mesh>
    </group>
  );
}

function Cafe() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[2, 1.8, 2]} /><M {...MAT.cream} /></mesh>
      <mesh position={[0, 1.6, 1.1]} rotation={[0.3, 0, 0]} castShadow><boxGeometry args={[2.2, 0.04, 0.7]} /><M {...MAT.orange} /></mesh>
      <mesh position={[0.4, 0.4, 1.01]} castShadow><boxGeometry args={[0.35, 0.8, 0.02]} /><M {...MAT.wood} /></mesh>
      <mesh position={[-0.4, 0.8, 1.01]} castShadow><boxGeometry args={[0.5, 0.6, 0.02]} /><M {...MAT.glass} /></mesh>
    </group>
  );
}

function Hotel() {
  return (
    <group>
      <mesh position={[0, 5, 0]} castShadow><boxGeometry args={[4, 10, 3]} /><M {...MAT.cream} /></mesh>
      {Array.from({ length: 8 }).map((_, floor) =>
        [-1.2, -0.4, 0.4, 1.2].map((x, xi) => (
          <mesh key={`${floor}-${xi}`} position={[x, floor * 1.1 + 1.2, 1.51]} castShadow>
            <boxGeometry args={[0.4, 0.5, 0.02]} /><M {...MAT.glass} />
          </mesh>
        ))
      )}
      <mesh position={[0, 0.8, 1.8]} castShadow><boxGeometry args={[1.5, 0.04, 0.6]} /><M {...MAT.red} /></mesh>
      <mesh position={[0, 10.2, 0]} castShadow><boxGeometry args={[4.2, 0.3, 3.2]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Mall() {
  return (
    <group>
      <mesh position={[0, 2, 0]} castShadow><boxGeometry args={[6, 4, 4]} /><M {...MAT.white} /></mesh>
      <mesh position={[0, 1, 2.01]} castShadow><boxGeometry args={[4, 2.5, 0.02]} /><M {...MAT.glass} /></mesh>
      <mesh position={[0, 3.6, 2.01]} castShadow><boxGeometry args={[3, 0.5, 0.04]} /><M {...MAT.red} /></mesh>
      <mesh position={[0, 4.15, 0]} castShadow><boxGeometry args={[6.2, 0.15, 4.2]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

/* ─── ENTERTAINMENT ─── */

function Stage() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[4, 0.6, 3]} /><M {...MAT.darkWood} /></mesh>
      {[-1.8, 1.8].map(x => (
        <mesh key={x} position={[x, 2, -1.3]} castShadow><boxGeometry args={[0.1, 3.4, 0.1]} /><M {...MAT.darkMetal} /></mesh>
      ))}
      <mesh position={[0, 3.7, -1.3]} castShadow><boxGeometry args={[3.8, 0.1, 0.1]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Screen() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><cylinderGeometry args={[0.05, 0.08, 3, 6]} /><M {...MAT.darkMetal} /></mesh>
      <mesh position={[0, 3.2, 0]} castShadow><boxGeometry args={[2.5, 1.4, 0.06]} /><M color="#111111" roughness={0.1} metalness={0.8} /></mesh>
      <mesh position={[0, 3.2, 0.04]}>
        <boxGeometry args={[2.3, 1.2, 0.01]} /><meshBasicMaterial color="#1a1a3a" />
      </mesh>
    </group>
  );
}

function FerrisWheel() {
  return (
    <group>
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a, i) => (
        <mesh key={i} position={[0, 3 + Math.sin(a * Math.PI / 180) * 2.5, Math.cos(a * Math.PI / 180) * 2.5]} castShadow>
          <boxGeometry args={[0.2, 0.3, 0.2]} /><M color={i % 2 ? '#E53935' : '#1E88E5'} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 3, 0]} castShadow rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[2.5, 0.05, 8, 24]} /><M {...MAT.metal} /></mesh>
      {[-0.8, 0.8].map(x => (
        <mesh key={x} position={[x, 1.5, 0]} castShadow><boxGeometry args={[0.1, 4, 0.1]} /><M {...MAT.metal} /></mesh>
      ))}
    </group>
  );
}

function Amphitheater() {
  return (
    <group>
      {[0, 1, 2].map(row => (
        <mesh key={row} position={[0, row * 0.4 + 0.2, -row * 1.2]} castShadow>
          <boxGeometry args={[4 + row, 0.4, 1]} /><M {...MAT.stone} />
        </mesh>
      ))}
      <mesh position={[0, 0.1, 2]} receiveShadow><boxGeometry args={[3, 0.2, 2]} /><M {...MAT.darkWood} /></mesh>
    </group>
  );
}

/* ─── INFRASTRUCTURE ─── */

function RoadStraight() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2, 4]} /><M color="#333333" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {[-1.5, 0, 1.5].map(z => (
        <mesh key={z} position={[0, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.1, 0.5]} /><M {...MAT.yellow} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function RoadCurve() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, 3]} /><M color="#333333" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function RoadIntersection() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, 3]} /><M color="#333333" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {[[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.5, 0.08]} /><M {...MAT.white} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function ParkingLot() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5, 4]} /><M color="#444444" roughness={0.95} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      {[-1.5, -0.5, 0.5, 1.5].map(x => (
        <mesh key={x} position={[x, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.04, 2.5]} /><M {...MAT.white} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function HighwayRamp() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} rotation={[-0.15, 0, 0]} castShadow>
        <boxGeometry args={[2, 0.15, 6]} /><M color="#555555" roughness={0.85} metalness={0.05} />
      </mesh>
      {[-0.9, 0.9].map(x => (
        <mesh key={x} position={[x, 0.6, 0]} rotation={[-0.15, 0, 0]} castShadow>
          <boxGeometry args={[0.08, 0.3, 6]} /><M {...MAT.stone} />
        </mesh>
      ))}
    </group>
  );
}

/* ─── WATER ─── */

function Pool() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[3, 0.4, 2]} /><M {...MAT.stone} /></mesh>
      <mesh position={[0, 0.15, 0]}><boxGeometry args={[2.6, 0.25, 1.6]} /><M {...MAT.water} /></mesh>
    </group>
  );
}

function Canal() {
  return (
    <group>
      <mesh position={[-1.2, 0.15, 0]} castShadow><boxGeometry args={[0.3, 0.3, 5]} /><M {...MAT.stone} /></mesh>
      <mesh position={[1.2, 0.15, 0]} castShadow><boxGeometry args={[0.3, 0.3, 5]} /><M {...MAT.stone} /></mesh>
      <mesh position={[0, 0.05, 0]}><boxGeometry args={[2.1, 0.1, 5]} /><M {...MAT.water} /></mesh>
    </group>
  );
}

function Waterfall() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[2, 3, 1]} /><M {...MAT.stone} /></mesh>
      <mesh position={[0, 1.5, 0.51]}><boxGeometry args={[1, 3, 0.02]} /><M {...MAT.water} /></mesh>
      <mesh position={[0, -0.05, 1]}><boxGeometry args={[2.5, 0.1, 1.5]} /><M {...MAT.water} /></mesh>
    </group>
  );
}

function Dock() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[1.5, 0.1, 4]} /><M {...MAT.wood} /></mesh>
      {[-0.6, 0.6].map(x => [-1.5, 0, 1.5].map(z => (
        <mesh key={`${x}-${z}`} position={[x, 0.1, z]} castShadow><cylinderGeometry args={[0.05, 0.05, 0.5, 6]} /><M {...MAT.darkWood} /></mesh>
      )))}
      <mesh position={[0, 0.45, 2]} castShadow><cylinderGeometry args={[0.08, 0.08, 0.4, 6]} /><M {...MAT.wood} /></mesh>
    </group>
  );
}

function Pier() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[2, 0.12, 6]} /><M {...MAT.wood} /></mesh>
      {[-0.9, 0.9].map(x => (
        <mesh key={x} position={[x, 0.55, 0]} castShadow><boxGeometry args={[0.04, 0.3, 6]} /><M {...MAT.wood} /></mesh>
      ))}
      {[-0.9, 0.9].map(x => [-2.5, 0, 2.5].map(z => (
        <mesh key={`p${x}-${z}`} position={[x, 0.15, z]} castShadow><cylinderGeometry args={[0.06, 0.06, 0.7, 6]} /><M {...MAT.darkWood} /></mesh>
      )))}
    </group>
  );
}

function Lighthouse() {
  return (
    <group>
      <mesh position={[0, 3, 0]} castShadow><cylinderGeometry args={[0.4, 0.7, 6, 12]} /><M {...MAT.white} /></mesh>
      <mesh position={[0, 5, 0]} castShadow><boxGeometry args={[0.3, 0.3, 0.3]} /><M color="#FFD54F" roughness={0.3} metalness={0.3} /></mesh>
      <mesh position={[0, 6.3, 0]} castShadow><cylinderGeometry args={[0.5, 0.45, 0.8, 12]} /><M {...MAT.red} /></mesh>
      <mesh position={[0, 6.5, 0]}><sphereGeometry args={[0.2, 8, 8]} /><meshBasicMaterial color="#FFF9C4" /></mesh>
      <pointLight position={[0, 6.5, 0]} color="#FFF9C4" intensity={1.5} distance={20} />
      <mesh position={[0, 6.8, 0]} castShadow><coneGeometry args={[0.55, 0.4, 12]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

/* ─── SCI-FI ─── */

function Dome() {
  return (
    <group>
      <mesh position={[0, 0, 0]} castShadow><sphereGeometry args={[2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><M {...MAT.glass} /></mesh>
      <mesh position={[0, 0.05, 0]} receiveShadow><cylinderGeometry args={[2.05, 2.05, 0.1, 24]} /><M {...MAT.metal} /></mesh>
    </group>
  );
}

function Antenna() {
  return (
    <group>
      <mesh position={[0, 3, 0]} castShadow><cylinderGeometry args={[0.04, 0.08, 6, 6]} /><M {...MAT.metal} /></mesh>
      {[1.5, 3, 4.5].map(y => (
        <mesh key={y} position={[0, y, 0]} castShadow><boxGeometry args={[0.8 / (y / 1.5), 0.03, 0.03]} /><M {...MAT.metal} /></mesh>
      ))}
      <mesh position={[0, 6.1, 0]}><sphereGeometry args={[0.08, 6, 6]} /><meshBasicMaterial color="#ff0000" /></mesh>
    </group>
  );
}

function SatelliteDish() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.06, 0.08, 1, 6]} /><M {...MAT.metal} /></mesh>
      <mesh position={[0, 1.2, 0]} rotation={[-0.5, 0, 0]} castShadow>
        <sphereGeometry args={[0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><M {...MAT.white} />
      </mesh>
      <mesh position={[0, 1.5, 0.3]} castShadow><cylinderGeometry args={[0.02, 0.02, 0.6, 4]} /><M {...MAT.metal} /></mesh>
    </group>
  );
}

function Monolith() {
  return (
    <mesh position={[0, 2, 0]} castShadow>
      <boxGeometry args={[1, 4, 0.2]} /><M color="#0a0a0a" roughness={0.05} metalness={0.95} />
    </mesh>
  );
}

function PortalGate() {
  return (
    <group>
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * 1, 1.5, 0]} castShadow><boxGeometry args={[0.2, 3, 0.2]} /><M color="#6A1B9A" roughness={0.3} metalness={0.7} /></mesh>
      ))}
      <mesh position={[0, 3.1, 0]} castShadow><boxGeometry args={[2.2, 0.2, 0.2]} /><M color="#6A1B9A" roughness={0.3} metalness={0.7} /></mesh>
      <mesh position={[0, 1.5, 0]}><torusGeometry args={[0.8, 0.04, 8, 24]} /><meshBasicMaterial color="#e040fb" transparent opacity={0.6} /></mesh>
      <pointLight position={[0, 1.5, 0]} color="#e040fb" intensity={0.8} distance={5} />
    </group>
  );
}

function NeonSign() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[1.5, 0.8, 0.06]} /><M color="#111111" roughness={0.9} /></mesh>
      <mesh position={[0, 1.5, 0.04]}><boxGeometry args={[1.2, 0.5, 0.02]} /><meshBasicMaterial color="#ff1744" /></mesh>
      <pointLight position={[0, 1.5, 0.3]} color="#ff1744" intensity={0.6} distance={4} />
    </group>
  );
}

function HologramDisplay() {
  return (
    <group>
      <mesh position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.6, 0.7, 0.3, 12]} /><M {...MAT.darkMetal} /></mesh>
      <mesh position={[0, 1.2, 0]}><boxGeometry args={[0.8, 1.2, 0.8]} /><meshBasicMaterial color="#00e5ff" transparent opacity={0.2} wireframe /></mesh>
      <pointLight position={[0, 1.2, 0]} color="#00e5ff" intensity={0.5} distance={4} />
    </group>
  );
}

/* ─── AGRICULTURAL ─── */

function FarmField() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} receiveShadow><boxGeometry args={[4, 0.1, 4]} /><M {...MAT.dirt} /></mesh>
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[0, 0.2, i * 0.8 - 1.6]} castShadow><boxGeometry args={[3.5, 0.15, 0.15]} /><M color="#4CAF50" roughness={0.9} /></mesh>
      ))}
    </group>
  );
}

function Barn() {
  return (
    <group>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[3, 3, 2.5]} /><M {...MAT.red} /></mesh>
      <mesh position={[0, 3.3, 0]} castShadow><cylinderGeometry args={[0, 1.8, 1, 4]} /><M {...MAT.red} /></mesh>
      <mesh position={[0, 0.7, 1.26]} castShadow><boxGeometry args={[1, 1.4, 0.02]} /><M {...MAT.darkWood} /></mesh>
      <mesh position={[0, 3.8, 0]} castShadow><boxGeometry args={[0.2, 0.6, 0.2]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Silo() {
  return (
    <group>
      <mesh position={[0, 2.5, 0]} castShadow><cylinderGeometry args={[0.7, 0.7, 5, 12]} /><M {...MAT.metal} /></mesh>
      <mesh position={[0, 5.2, 0]} castShadow><coneGeometry args={[0.75, 0.6, 12]} /><M {...MAT.darkMetal} /></mesh>
    </group>
  );
}

function Greenhouse() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow><boxGeometry args={[3, 1.6, 2]} /><M {...MAT.glass} /></mesh>
      <mesh position={[0, 1.8, 0]} castShadow><cylinderGeometry args={[0, 1.5, 0.5, 4]} /><M {...MAT.glass} /></mesh>
      <mesh position={[0, 0.1, 0]} receiveShadow><boxGeometry args={[2.8, 0.05, 1.8]} /><M {...MAT.dirt} /></mesh>
    </group>
  );
}

function Vineyard() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[5, 0.04, 4]} /><M {...MAT.dirt} /></mesh>
      {[-1.5, 0, 1.5].map(x => (
        <group key={x}>
          {[-1.5, 0, 1.5].map(z => (
            <mesh key={z} position={[x, 0.5, z]} castShadow><cylinderGeometry args={[0.02, 0.02, 1, 4]} /><M {...MAT.wood} /></mesh>
          ))}
          <mesh position={[x, 0.8, 0]} castShadow><boxGeometry args={[0.02, 0.02, 3.5]} /><M {...MAT.wood} /></mesh>
          <mesh position={[x, 0.7, 0]} castShadow><boxGeometry args={[0.4, 0.3, 3]} /><M {...MAT.leaf} /></mesh>
        </group>
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREFAB REGISTRY & RENDERER
   ═══════════════════════════════════════════════════════════════════════════ */

export const PREFAB_CATALOG: Record<string, { category: string; label: string }> = {
  // Nature
  tree_oak: { category: 'nature', label: 'Oak Tree' },
  tree_pine: { category: 'nature', label: 'Pine Tree' },
  tree_palm: { category: 'nature', label: 'Palm Tree' },
  tree_cherry_blossom: { category: 'nature', label: 'Cherry Blossom' },
  bush: { category: 'nature', label: 'Bush' },
  flower_rose: { category: 'nature', label: 'Rose' },
  flower_tulip: { category: 'nature', label: 'Tulip' },
  flower_sunflower: { category: 'nature', label: 'Sunflower' },
  grass_patch: { category: 'nature', label: 'Grass Patch' },
  pond: { category: 'nature', label: 'Pond' },
  rock: { category: 'nature', label: 'Rock' },
  log: { category: 'nature', label: 'Log' },
  // Park
  bench: { category: 'park', label: 'Park Bench' },
  path_stone: { category: 'park', label: 'Stone Path' },
  path_dirt: { category: 'park', label: 'Dirt Path' },
  fountain: { category: 'park', label: 'Fountain' },
  lamp_post: { category: 'park', label: 'Lamp Post' },
  fence: { category: 'park', label: 'Fence' },
  gate: { category: 'park', label: 'Gate' },
  gazebo: { category: 'park', label: 'Gazebo' },
  bridge: { category: 'park', label: 'Bridge' },
  // Urban
  building_small: { category: 'urban', label: 'Small Building' },
  building_tall: { category: 'urban', label: 'Tall Building' },
  shop: { category: 'urban', label: 'Shop' },
  sign: { category: 'urban', label: 'Sign' },
  mailbox: { category: 'urban', label: 'Mailbox' },
  trash_can: { category: 'urban', label: 'Trash Can' },
  fire_hydrant: { category: 'urban', label: 'Fire Hydrant' },
  // Decorative
  statue: { category: 'decorative', label: 'Statue' },
  flag: { category: 'decorative', label: 'Flag' },
  banner: { category: 'decorative', label: 'Banner' },
  planter: { category: 'decorative', label: 'Planter' },
  hedge_wall: { category: 'decorative', label: 'Hedge Wall' },
  arch: { category: 'decorative', label: 'Arch' },
  pergola: { category: 'decorative', label: 'Pergola' },
  // Industrial
  factory: { category: 'industrial', label: 'Factory' },
  warehouse: { category: 'industrial', label: 'Warehouse' },
  crane: { category: 'industrial', label: 'Crane' },
  smokestack: { category: 'industrial', label: 'Smokestack' },
  water_tower: { category: 'industrial', label: 'Water Tower' },
  windmill: { category: 'industrial', label: 'Windmill' },
  solar_panel: { category: 'industrial', label: 'Solar Panel' },
  // Residential
  house_small: { category: 'residential', label: 'Small House' },
  house_modern: { category: 'residential', label: 'Modern House' },
  apartment: { category: 'residential', label: 'Apartment' },
  cottage: { category: 'residential', label: 'Cottage' },
  cabin: { category: 'residential', label: 'Cabin' },
  // Commercial
  office_tower: { category: 'commercial', label: 'Office Tower' },
  restaurant: { category: 'commercial', label: 'Restaurant' },
  cafe: { category: 'commercial', label: 'Cafe' },
  hotel: { category: 'commercial', label: 'Hotel' },
  mall: { category: 'commercial', label: 'Mall' },
  // Entertainment
  stage: { category: 'entertainment', label: 'Stage' },
  screen: { category: 'entertainment', label: 'Screen' },
  ferris_wheel: { category: 'entertainment', label: 'Ferris Wheel' },
  amphitheater: { category: 'entertainment', label: 'Amphitheater' },
  // Infrastructure
  road_straight: { category: 'infrastructure', label: 'Straight Road' },
  road_curve: { category: 'infrastructure', label: 'Road Curve' },
  road_intersection: { category: 'infrastructure', label: 'Road Intersection' },
  parking_lot: { category: 'infrastructure', label: 'Parking Lot' },
  highway_ramp: { category: 'infrastructure', label: 'Highway Ramp' },
  // Water
  pool: { category: 'water', label: 'Pool' },
  canal: { category: 'water', label: 'Canal' },
  waterfall: { category: 'water', label: 'Waterfall' },
  dock: { category: 'water', label: 'Dock' },
  pier: { category: 'water', label: 'Pier' },
  lighthouse: { category: 'water', label: 'Lighthouse' },
  // Sci-fi
  dome: { category: 'scifi', label: 'Dome' },
  antenna: { category: 'scifi', label: 'Antenna' },
  satellite_dish: { category: 'scifi', label: 'Satellite Dish' },
  monolith: { category: 'scifi', label: 'Monolith' },
  portal_gate: { category: 'scifi', label: 'Portal Gate' },
  neon_sign: { category: 'scifi', label: 'Neon Sign' },
  hologram_display: { category: 'scifi', label: 'Hologram Display' },
  // Agricultural
  farm_field: { category: 'agricultural', label: 'Farm Field' },
  barn: { category: 'agricultural', label: 'Barn' },
  silo: { category: 'agricultural', label: 'Silo' },
  greenhouse: { category: 'agricultural', label: 'Greenhouse' },
  vineyard: { category: 'agricultural', label: 'Vineyard' },
};

export const PREFAB_LIST = Object.keys(PREFAB_CATALOG);

const PREFAB_COMPONENTS: Record<string, React.FC> = {
  tree_oak: TreeOak,
  tree_pine: TreePine,
  tree_palm: TreePalm,
  tree_cherry_blossom: TreeCherryBlossom,
  bush: Bush,
  flower_rose: FlowerRose,
  flower_tulip: FlowerTulip,
  flower_sunflower: FlowerSunflower,
  grass_patch: GrassPatch,
  pond: Pond,
  rock: Rock,
  log: Log,
  bench: Bench,
  path_stone: PathStone,
  path_dirt: PathDirt,
  fountain: Fountain,
  lamp_post: LampPost,
  fence: Fence,
  gate: Gate,
  gazebo: Gazebo,
  bridge: Bridge,
  building_small: BuildingSmall,
  building_tall: BuildingTall,
  shop: Shop,
  sign: Sign,
  mailbox: Mailbox,
  trash_can: TrashCan,
  fire_hydrant: FireHydrant,
  statue: Statue,
  flag: Flag,
  banner: Banner,
  planter: Planter,
  hedge_wall: HedgeWall,
  arch: Arch,
  pergola: Pergola,
  // Industrial
  factory: Factory,
  warehouse: Warehouse,
  crane: Crane,
  smokestack: Smokestack,
  water_tower: WaterTower,
  windmill: Windmill,
  solar_panel: SolarPanel,
  // Residential
  house_small: HouseSmall,
  house_modern: HouseModern,
  apartment: Apartment,
  cottage: Cottage,
  cabin: Cabin,
  // Commercial
  office_tower: OfficeTower,
  restaurant: Restaurant,
  cafe: Cafe,
  hotel: Hotel,
  mall: Mall,
  // Entertainment
  stage: Stage,
  screen: Screen,
  ferris_wheel: FerrisWheel,
  amphitheater: Amphitheater,
  // Infrastructure
  road_straight: RoadStraight,
  road_curve: RoadCurve,
  road_intersection: RoadIntersection,
  parking_lot: ParkingLot,
  highway_ramp: HighwayRamp,
  // Water
  pool: Pool,
  canal: Canal,
  waterfall: Waterfall,
  dock: Dock,
  pier: Pier,
  lighthouse: Lighthouse,
  // Sci-fi
  dome: Dome,
  antenna: Antenna,
  satellite_dish: SatelliteDish,
  monolith: Monolith,
  portal_gate: PortalGate,
  neon_sign: NeonSign,
  hologram_display: HologramDisplay,
  // Agricultural
  farm_field: FarmField,
  barn: Barn,
  silo: Silo,
  greenhouse: Greenhouse,
  vineyard: Vineyard,
};

/* Main prefab renderer — used by WorldObjects to render prefab-type objects */
export function PrefabObject({
  prefabType,
  position,
  rotation,
  scale,
  isSelected,
  onClick,
}: {
  prefabType: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const Component = PREFAB_COMPONENTS[prefabType];
  if (!Component) return null;

  return (
    <group
      position={position}
      rotation={rotation.map(r => r * Math.PI / 180) as [number, number, number]}
      scale={scale}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <Component />
      {isSelected && (
        <mesh>
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial color="#f7931a" wireframe transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
}

export default PrefabObject;
