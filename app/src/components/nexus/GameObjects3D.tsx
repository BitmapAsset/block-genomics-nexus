'use client';
import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { GameElement } from './GameElementsPanel';

/* ─── Animation Helpers ─── */
function useAnimation(animation: string | undefined, ref: React.RefObject<THREE.Group | null>) {
  const baseY = useRef(0);
  const initialized = useRef(false);

  useFrame((state) => {
    if (!ref.current) return;
    if (!initialized.current) {
      baseY.current = ref.current.position.y;
      initialized.current = true;
    }
    const t = state.clock.elapsedTime;

    switch (animation) {
      case 'bounce':
        ref.current.position.y = baseY.current + Math.abs(Math.sin(t * 2)) * 0.3;
        break;
      case 'spin':
        ref.current.rotation.y = t * 2;
        break;
      case 'pulse': {
        const s = 1 + Math.sin(t * 3) * 0.1;
        ref.current.scale.set(s, s, s);
        break;
      }
      case 'float':
        ref.current.position.y = baseY.current + Math.sin(t * 1.5) * 0.2;
        break;
      case 'orbit':
        ref.current.position.x = ref.current.userData.baseX + Math.cos(t) * 0.5;
        ref.current.position.z = ref.current.userData.baseZ + Math.sin(t) * 0.5;
        ref.current.rotation.y = t;
        break;
    }
  });
}

/* ─── Collectible Object ─── */
function CollectibleObject({ element, onClaim, isCollected }: { element: GameElement; onClaim: (id: string) => void; isCollected: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const [showPopup, setShowPopup] = useState(false);
  useAnimation(element.animation, ref);

  const color = element.color || '#ffd700';
  const glowColor = element.glowColor || color;

  if (isCollected && !element.respawnMs) return null;

  return (
    <group ref={ref} position={[element.posX, element.posY, element.posZ]}
      userData={{ baseX: element.posX, baseZ: element.posZ }}
      onClick={(e) => { e.stopPropagation(); onClaim(element.id); setShowPopup(true); setTimeout(() => setShowPopup(false), 2000); }}>
      {/* Main shape */}
      <mesh castShadow>
        {element.subType === 'coin' || element.subType === 'key' ? (
          <cylinderGeometry args={[0.3, 0.3, 0.05, 16]} />
        ) : element.subType === 'gem' || element.subType === 'star' ? (
          <octahedronGeometry args={[0.25]} />
        ) : (
          <boxGeometry args={[0.4, 0.4, 0.4]} />
        )}
        <meshStandardMaterial color={color} emissive={glowColor} emissiveIntensity={0.5} metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Glow */}
      <pointLight color={glowColor} intensity={0.5} distance={3} />
      {/* Icon label */}
      <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: '16px', textShadow: '0 0 8px rgba(255,200,0,0.8)' }}>{element.icon}</div>
      </Html>
      {/* Claim popup */}
      {showPopup && (
        <Html center distanceFactor={2} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(0,0,0,0.8)', border: '1px solid #f7931a',
            borderRadius: '8px', padding: '4px 12px', color: '#f7931a',
            fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap',
            animation: 'fadeUp 2s ease-out forwards',
          }}>
            +{element.rewardAmount} {element.rewardType}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ─── Checkpoint Gate ─── */
function CheckpointGate({ element }: { element: GameElement }) {
  const ref = useRef<THREE.Group>(null);
  useAnimation('spin', ref);
  const color = element.color || '#00aaff';

  return (
    <group ref={ref} position={[element.posX, element.posY + 1, element.posZ]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.08, 8, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.7} />
      </mesh>
      <pointLight color={color} intensity={0.8} distance={5} />
    </group>
  );
}

/* ─── Game Zone ─── */
function GameZone({ element }: { element: GameElement }) {
  const ref = useRef<THREE.Group>(null);
  useAnimation('pulse', ref);
  const color = element.color || '#00cc44';
  const radius = element.triggerRadius || 5;

  return (
    <group ref={ref} position={[element.posX, 0.01, element.posZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.1, radius, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius, radius, 0.02, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} />
      </mesh>
      <Html center position={[0, 2, 0]} distanceFactor={5} style={{ pointerEvents: 'none' }}>
        <div style={{ color, fontFamily: 'monospace', fontSize: '11px', textShadow: `0 0 6px ${color}` }}>
          {element.icon} {element.label}
        </div>
      </Html>
    </group>
  );
}

/* ─── NPC Character ─── */
function NPCCharacter({ element }: { element: GameElement }) {
  const ref = useRef<THREE.Group>(null);
  useAnimation('float', ref);
  const color = element.color || '#88cc44';

  return (
    <group ref={ref} position={[element.posX, element.posY, element.posZ]}>
      {/* Body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.3, 1.2, 8]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color={color} emissive={element.glowColor || color} emissiveIntensity={0.3} />
      </mesh>
      {/* Quest indicator */}
      <Html center position={[0, 2, 0]} distanceFactor={3} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: '20px', textShadow: '0 0 8px rgba(255,170,0,0.8)' }}>
          {element.subType === 'quest_giver' ? '❗' : element.icon}
        </div>
      </Html>
      <Html center position={[0, 1.8, 0]} distanceFactor={4} style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: '10px', background: 'rgba(0,0,0,0.6)', padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
          {element.label}
        </div>
      </Html>
    </group>
  );
}

/* ─── Target Object ─── */
function TargetObject({ element, onClaim }: { element: GameElement; onClaim: (id: string) => void }) {
  const ref = useRef<THREE.Group>(null);
  const [hit, setHit] = useState(false);
  useAnimation(element.animation, ref);

  return (
    <group ref={ref} position={[element.posX, element.posY, element.posZ]}
      userData={{ baseX: element.posX, baseZ: element.posZ }}
      onClick={(e) => { e.stopPropagation(); setHit(true); onClaim(element.id); setTimeout(() => setHit(false), 500); }}>
      <mesh castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.05, 32]} />
        <meshStandardMaterial color={hit ? '#00ff00' : '#ff3333'} emissive={hit ? '#00ff00' : '#ff0000'} emissiveIntensity={hit ? 1 : 0.3} />
      </mesh>
      {/* Inner rings */}
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 32]} />
        <meshStandardMaterial color="#ffffff" emissiveIntensity={0.1} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.05, 32]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>
      {hit && (
        <Html center distanceFactor={2} style={{ pointerEvents: 'none' }}>
          <div style={{ color: '#00ff00', fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold' }}>HIT! +{element.rewardAmount || 10}</div>
        </Html>
      )}
    </group>
  );
}

/* ─── Leaderboard Display ─── */
function LeaderboardDisplay({ element, blockHeight }: { element: GameElement; blockHeight: number }) {
  const [entries, setEntries] = useState<{ walletAddress: string; handle?: string; value: number }[]>([]);

  useEffect(() => {
    fetch(`/api/v1/game/leaderboard?blockHeight=${blockHeight}&limit=5`)
      .then(r => r.json())
      .then(d => { if (d.entries) setEntries(d.entries); })
      .catch(console.error);
  }, [blockHeight]);

  return (
    <group position={[element.posX, element.posY + 1.5, element.posZ]}>
      <mesh>
        <boxGeometry args={[2, 1.5, 0.1]} />
        <meshStandardMaterial color="#1a1a2e" emissive="#f7931a" emissiveIntensity={0.05} metalness={0.9} roughness={0.1} />
      </mesh>
      <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid #f7931a', borderRadius: '8px', padding: '8px 12px', minWidth: '120px' }}>
          <div style={{ color: '#f7931a', fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>🏆 LEADERBOARD</div>
          {entries.length === 0 ? (
            <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '9px', textAlign: 'center' }}>No scores yet</div>
          ) : entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '9px', color: i === 0 ? '#ffd700' : '#94a3b8' }}>
              <span>{i + 1}. {e.handle || e.walletAddress.slice(0, 8)}</span>
              <span>{e.value}</span>
            </div>
          ))}
        </div>
      </Html>
    </group>
  );
}

/* ─── Main Renderer ─── */
export default function GameObjects3D({
  blockHeight,
  elements,
  walletAddress,
  onClaim,
  collected,
}: {
  blockHeight: number;
  elements: GameElement[];
  walletAddress?: string;
  onClaim?: (elementId: string) => void;
  collected?: string[];
}) {
  const handleClaim = useCallback((id: string) => {
    if (onClaim) onClaim(id);
  }, [onClaim]);

  const collectedSet = useMemo(() => new Set(collected || []), [collected]);

  if (elements.length === 0) return null;

  return (
    <group>
      {elements.filter(e => e.visible && e.enabled).map(element => {
        switch (element.gameType) {
          case 'collectible':
            return <CollectibleObject key={element.id} element={element} onClaim={handleClaim} isCollected={collectedSet.has(element.id)} />;
          case 'checkpoint':
            return <CheckpointGate key={element.id} element={element} />;
          case 'zone':
            return <GameZone key={element.id} element={element} />;
          case 'npc':
            return <NPCCharacter key={element.id} element={element} />;
          case 'target':
            return <TargetObject key={element.id} element={element} onClaim={handleClaim} />;
          case 'scoreboard':
            return <LeaderboardDisplay key={element.id} element={element} blockHeight={blockHeight} />;
          case 'trigger':
            // Triggers use collectible-style rendering with different visuals
            return <CollectibleObject key={element.id} element={element} onClaim={handleClaim} isCollected={false} />;
          default:
            return <CollectibleObject key={element.id} element={element} onClaim={handleClaim} isCollected={collectedSet.has(element.id)} />;
        }
      })}
    </group>
  );
}
