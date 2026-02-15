'use client';
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { WorldObject, TerrainSettings } from './WorldBuilderPanel';

/* ─── Primitive Geometry Component ─── */
function PrimitiveObject({ obj, isSelected, onClick }: { obj: WorldObject; isSelected: boolean; onClick: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = obj.color || '#f7931a';
  const emissive = obj.emissive || '#000000';

  const geometry = useMemo(() => {
    switch (obj.geometry) {
      case 'sphere': return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone': return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus': return <torusGeometry args={[0.5, 0.15, 16, 32]} />;
      case 'plane': return <planeGeometry args={[1, 1]} />;
      case 'ring': return <ringGeometry args={[0.3, 0.5, 32]} />;
      default: return <boxGeometry args={[1, 1, 1]} />;
    }
  }, [obj.geometry]);

  return (
    <mesh
      ref={meshRef}
      position={[obj.posX, obj.posY, obj.posZ]}
      rotation={[obj.rotX * Math.PI / 180, obj.rotY * Math.PI / 180, obj.rotZ * Math.PI / 180]}
      scale={[obj.scaleX, obj.scaleY, obj.scaleZ]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      castShadow receiveShadow
    >
      {geometry}
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={obj.emissiveIntensity || 0}
        metalness={obj.metalness ?? 0.5}
        roughness={obj.roughness ?? 0.5}
        opacity={obj.opacity ?? 1}
        transparent={obj.transparent || false}
        side={obj.geometry === 'plane' ? THREE.DoubleSide : THREE.FrontSide}
      />
      {isSelected && (
        <mesh>
          {geometry}
          <meshBasicMaterial color="#f7931a" wireframe transparent opacity={0.5} />
        </mesh>
      )}
    </mesh>
  );
}

/* ─── Light Object ─── */
function LightObject({ obj, isSelected, onClick }: { obj: WorldObject; isSelected: boolean; onClick: () => void }) {
  const color = obj.lightColor || '#ffffff';
  const intensity = obj.lightIntensity ?? 1;
  const distance = obj.lightDistance ?? 20;

  return (
    <group position={[obj.posX, obj.posY, obj.posZ]}>
      {obj.lightType === 'point' && <pointLight color={color} intensity={intensity} distance={distance} castShadow />}
      {obj.lightType === 'spot' && <spotLight color={color} intensity={intensity} distance={distance} angle={0.5} castShadow />}
      {obj.lightType === 'directional' && <directionalLight color={color} intensity={intensity} castShadow />}
      {/* Visual indicator */}
      <mesh onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
      {isSelected && (
        <mesh>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#f7931a" wireframe transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

/* ─── Effect Object ─── */
function EffectObject({ obj, isSelected, onClick }: { obj: WorldObject; isSelected: boolean; onClick: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = obj.color || '#8b00ff';

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
      if (obj.effectType === 'portal') {
        meshRef.current.rotation.z += delta * 0.3;
      }
    }
  });

  const effectMesh = useMemo(() => {
    switch (obj.effectType) {
      case 'portal':
        return <torusGeometry args={[1, 0.1, 16, 32]} />;
      case 'fire':
        return <coneGeometry args={[0.5, 1.5, 8]} />;
      case 'hologram':
        return <boxGeometry args={[1, 1.5, 0.05]} />;
      case 'particles':
        return <sphereGeometry args={[0.5, 8, 8]} />;
      default:
        return <sphereGeometry args={[0.5, 16, 16]} />;
    }
  }, [obj.effectType]);

  return (
    <group position={[obj.posX, obj.posY, obj.posZ]} scale={[obj.scaleX, obj.scaleY, obj.scaleZ]}>
      <mesh ref={meshRef} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        {effectMesh}
        <meshBasicMaterial color={color} transparent opacity={0.6} wireframe={obj.effectType === 'hologram'} />
      </mesh>
      {isSelected && (
        <mesh>
          <sphereGeometry args={[1.2, 8, 8]} />
          <meshBasicMaterial color="#f7931a" wireframe transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
}

/* ─── Text3D Object (Billboard) ─── */
function Text3DObject({ obj, isSelected, onClick }: { obj: WorldObject; isSelected: boolean; onClick: () => void }) {
  return (
    <group position={[obj.posX, obj.posY, obj.posZ]}>
      <Html center distanceFactor={10} style={{ pointerEvents: 'auto' }} onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClick(); }}>
        <div style={{
          color: obj.color || '#f7931a',
          fontSize: `${(obj.fontSize || 1) * 20}px`,
          fontWeight: 'bold',
          fontFamily: 'monospace',
          textShadow: `0 0 10px ${obj.color || '#f7931a'}66`,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          border: isSelected ? '2px solid #f7931a' : 'none',
          padding: isSelected ? '2px 6px' : '0',
          borderRadius: '4px',
        }}>
          {obj.text3d || 'Text'}
        </div>
      </Html>
    </group>
  );
}

/* ─── Sound Object (Visual indicator only) ─── */
function SoundObject({ obj, isSelected, onClick }: { obj: WorldObject; isSelected: boolean; onClick: () => void }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ringRef.current) ringRef.current.rotation.y += delta * 0.2;
  });

  return (
    <group position={[obj.posX, obj.posY, obj.posZ]}>
      <mesh onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color="#00ff88" />
      </mesh>
      <mesh ref={ringRef}>
        <torusGeometry args={[obj.soundRadius ? obj.soundRadius * 0.1 : 0.5, 0.02, 8, 32]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.2} />
      </mesh>
      {isSelected && (
        <mesh>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#f7931a" wireframe transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

/* ─── Weather Effects ─── */
function WeatherEffect({ weather }: { weather?: string }) {
  const particlesRef = useRef<THREE.Points>(null);
  const count = weather === 'rain' ? 500 : weather === 'snow' ? 300 : weather === 'fireflies' ? 50 : 0;

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 60;
      arr[i * 3 + 1] = Math.random() * 30;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (!particlesRef.current || count === 0) return;
    const pos = particlesRef.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      if (weather === 'rain') {
        (pos.array as Float32Array)[i * 3 + 1] -= delta * 15;
        if ((pos.array as Float32Array)[i * 3 + 1] < 0) (pos.array as Float32Array)[i * 3 + 1] = 30;
      } else if (weather === 'snow') {
        (pos.array as Float32Array)[i * 3 + 1] -= delta * 2;
        (pos.array as Float32Array)[i * 3] += Math.sin(Date.now() * 0.001 + i) * delta * 0.5;
        if ((pos.array as Float32Array)[i * 3 + 1] < 0) (pos.array as Float32Array)[i * 3 + 1] = 30;
      } else if (weather === 'fireflies') {
        (pos.array as Float32Array)[i * 3] += Math.sin(Date.now() * 0.002 + i * 7) * delta * 0.5;
        (pos.array as Float32Array)[i * 3 + 1] += Math.sin(Date.now() * 0.003 + i * 3) * delta * 0.3;
        (pos.array as Float32Array)[i * 3 + 2] += Math.cos(Date.now() * 0.002 + i * 5) * delta * 0.5;
      }
    }
    pos.needsUpdate = true;
  });

  if (count === 0) return null;

  const pColor = weather === 'rain' ? '#aaccff' : weather === 'snow' ? '#ffffff' : '#88ff44';
  const pSize = weather === 'rain' ? 0.05 : weather === 'snow' ? 0.1 : 0.15;

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={pColor} size={pSize} transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

/* ─── Main WorldObjects Renderer ─── */
export default function WorldObjects({
  blockHeight, selectedObjectId, onSelectObject, isBuilder,
}: {
  blockHeight: number;
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  isBuilder?: boolean;
}) {
  const [objects, setObjects] = useState<WorldObject[]>([]);
  const [terrain, setTerrain] = useState<TerrainSettings>({});

  useEffect(() => {
    fetch(`/api/v1/world?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(data => {
        if (data.objects) setObjects(data.objects);
        if (data.terrain) setTerrain(data.terrain);
      })
      .catch(err => console.error('[WorldObjects] Fetch failed:', err));
  }, [blockHeight]);

  const handleClick = useCallback((id: string) => {
    if (onSelectObject) onSelectObject(id);
    else {
      // Visitor click — handle interactions
      const obj = objects.find(o => o.id === id);
      if (!obj?.interactive || !obj.clickAction) return;
      switch (obj.clickAction) {
        case 'url':
          if (obj.clickData) window.open(obj.clickData, '_blank');
          break;
        case 'message':
          if (obj.clickData) alert(obj.clickData);
          break;
      }
    }
  }, [objects, onSelectObject]);

  return (
    <group>
      {/* Terrain ambient light override */}
      {terrain.ambientColor && (
        <ambientLight color={terrain.ambientColor} intensity={terrain.ambientIntensity ?? 0.35} />
      )}

      {/* Weather */}
      {terrain.weather && terrain.weather !== 'none' && <WeatherEffect weather={terrain.weather} />}

      {/* Objects */}
      {objects.map(obj => {
        const isSelected = obj.id === selectedObjectId;
        const props = { key: obj.id, obj, isSelected, onClick: () => handleClick(obj.id) };

        switch (obj.objectType) {
          case 'primitive': return <PrimitiveObject {...props} />;
          case 'light': return <LightObject {...props} />;
          case 'effect': return <EffectObject {...props} />;
          case 'text3d': return <Text3DObject {...props} />;
          case 'sound': return <SoundObject {...props} />;
          default: return <PrimitiveObject {...props} />;
        }
      })}
    </group>
  );
}

/* ─── Hook for external state management ─── */
export function useWorldObjects(blockHeight: number) {
  const [objects, setObjects] = useState<WorldObject[]>([]);
  const [terrain, setTerrain] = useState<TerrainSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/world?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(data => {
        if (data.objects) setObjects(data.objects);
        if (data.terrain) setTerrain(data.terrain);
      })
      .catch(err => console.error('[useWorldObjects] Fetch failed:', err))
      .finally(() => setLoading(false));
  }, [blockHeight]);

  return { objects, setObjects, terrain, setTerrain, loading };
}
