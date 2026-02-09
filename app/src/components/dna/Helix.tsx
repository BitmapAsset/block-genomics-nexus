'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DNAState } from '../DNAVisualizer';

interface HelixProps {
  genomeHash: string;
  state: DNAState;
}

const cubeSize = 3.2;
const voxelGrid = 8;
const voxelsPerSide = voxelGrid - 1;
const rayCount = 22;
const agentPool = 18;
const loopDuration = 15;

const hexToColor = (hex: string) => new THREE.Color(hex);

const Helix: React.FC<HelixProps> = ({ genomeHash, state }) => {
  const groupRef = useRef<THREE.Group>(null);
  const voxelRef = useRef<THREE.InstancedMesh>(null);
  const helixRef = useRef<THREE.Group>(null);
  const raysRef = useRef<THREE.LineSegments>(null);
  const agentRefs = useRef<THREE.Sprite[]>([]);
  const agentBadges = useRef<THREE.Sprite[]>([]);

  const hash = genomeHash.toLowerCase();

  const { voxelTransforms, voxelCount } = useMemo(() => {
    const half = cubeSize / 2;
    const step = cubeSize / (voxelGrid - 1);
    const transforms: THREE.Matrix4[] = [];

    for (let x = 0; x < voxelGrid; x += 1) {
      for (let y = 0; y < voxelGrid; y += 1) {
        for (let z = 0; z < voxelGrid; z += 1) {
          const isEdge =
            x === 0 || y === 0 || z === 0 || x === voxelsPerSide || y === voxelsPerSide || z === voxelsPerSide;
          if (!isEdge) continue;
          const px = -half + x * step;
          const py = -half + y * step;
          const pz = -half + z * step;
          const matrix = new THREE.Matrix4();
          matrix.setPosition(px, py, pz);
          transforms.push(matrix);
        }
      }
    }

    return { voxelTransforms: transforms, voxelCount: transforms.length };
  }, []);

  const voxelColors = useMemo(() => {
    const colors = new Float32Array(voxelCount * 3);
    for (let i = 0; i < voxelCount; i += 1) {
      const t = (i % 9) / 9;
      const color = new THREE.Color().lerpColors(hexToColor('#F7931A'), hexToColor('#FFD28A'), t);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    return colors;
  }, [voxelCount]);

  const helixCurves = useMemo(() => {
    const pointsA: THREE.Vector3[] = [];
    const pointsB: THREE.Vector3[] = [];
    const length = 2.2;
    const turns = 3.2;
    for (let i = 0; i <= 220; i += 1) {
      const t = i / 220;
      const angle = t * Math.PI * 2 * turns;
      const radius = 0.6 + Math.sin(t * Math.PI * 2) * 0.08;
      const y = (t - 0.5) * length * 2.2;
      pointsA.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
      pointsB.push(new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius));
    }
    return {
      curveA: new THREE.CatmullRomCurve3(pointsA),
      curveB: new THREE.CatmullRomCurve3(pointsB),
    };
  }, []);

  const helixColors = useMemo(() => {
    const palette = hash.padEnd(16, '0').slice(0, 16).split('');
    return palette.map((h) => new THREE.Color(`#${h}${h}ff${h}${h}`));
  }, [hash]);

  const rayData = useMemo(() => {
    const dirs: THREE.Vector3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < rayCount; i += 1) {
      const y = 1 - (i / (rayCount - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      dirs.push(new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius));
    }
    return dirs;
  }, []);

  const rayGeometry = useMemo(() => {
    const positions = new Float32Array(rayCount * 2 * 3);
    rayData.forEach((dir, i) => {
      positions[i * 6] = 0;
      positions[i * 6 + 1] = 0;
      positions[i * 6 + 2] = 0;
      positions[i * 6 + 3] = dir.x * 6;
      positions[i * 6 + 4] = dir.y * 6;
      positions[i * 6 + 5] = dir.z * 6;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [rayData]);

  const emojiTextures = useMemo(() => {
    const makeEmoji = (emoji: string, tint: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, 256, 256);
      ctx.font = 'bold 140px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 128, 132);
      ctx.strokeStyle = tint;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(128, 128, 90, 0, Math.PI * 2);
      ctx.stroke();
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    };

    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 128;
    badgeCanvas.height = 128;
    const badgeCtx = badgeCanvas.getContext('2d');
    if (badgeCtx) {
      badgeCtx.clearRect(0, 0, 128, 128);
      badgeCtx.fillStyle = '#00ff99';
      badgeCtx.beginPath();
      badgeCtx.arc(64, 64, 46, 0, Math.PI * 2);
      badgeCtx.fill();
      badgeCtx.fillStyle = '#0a0a0f';
      badgeCtx.font = 'bold 64px sans-serif';
      badgeCtx.textAlign = 'center';
      badgeCtx.textBaseline = 'middle';
      badgeCtx.fillText('✓', 64, 70);
    }
    const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    badgeTexture.needsUpdate = true;

    return {
      bot: makeEmoji('🤖', '#59c3ff'),
      human: makeEmoji('👤', '#ffd36a'),
      badge: badgeTexture,
    };
  }, []);

  const agents = useMemo(() => {
    return Array.from({ length: agentPool }).map((_, i) => {
      const seed = (parseInt(hash[i % hash.length] || '0', 16) + 1) / 16;
      return {
        seed,
        progress: Math.random(),
        verified: false,
        type: i % 2 === 0 ? 'bot' : 'human',
      };
    });
  }, [hash]);

  useEffect(() => {
    if (!voxelRef.current) return;
    voxelTransforms.forEach((matrix, i) => {
      voxelRef.current!.setMatrixAt(i, matrix);
    });
    voxelRef.current.instanceMatrix.needsUpdate = true;
    voxelRef.current.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(voxelColors, 3));
  }, [voxelTransforms, voxelColors]);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const phase = time % loopDuration;
    const assemble = THREE.MathUtils.smoothstep(phase, 0, 2);
    const raysOn = THREE.MathUtils.smoothstep(phase, 2, 4);
    const pulse = 1 + Math.sin(time * 2.8) * 0.08;

    if (groupRef.current) {
      groupRef.current.rotation.y += 0.0003;
    }

    if (voxelRef.current) {
      const mat = voxelRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.35 + Math.sin(time * 1.8) * 0.05;
      mat.emissiveIntensity = 0.6 + Math.sin(time * 1.2) * 0.2;
      voxelRef.current.scale.setScalar(assemble);
    }

    if (helixRef.current) {
      helixRef.current.rotation.y += 0.004;
      helixRef.current.rotation.x = Math.sin(time * 0.7) * 0.2;
      helixRef.current.scale.setScalar(pulse);
      helixRef.current.visible = phase > 1.2;
    }

    if (raysRef.current) {
      const mat = raysRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.2 + raysOn * 0.6 + Math.sin(time * 3 + 1) * 0.1;
      raysRef.current.scale.setScalar(raysOn);
    }

    agentRefs.current.forEach((sprite, index) => {
      const badge = agentBadges.current[index];
      if (!sprite) return;
      const agent = agents[index];
      const progressSpeed = phase < 4 ? 0.0 : 0.003 + agent.seed * 0.004;
      agent.progress += progressSpeed;
      if (agent.progress > 1.2) {
        agent.progress = -0.2;
        agent.verified = false;
      }

      const dir = rayData[index % rayData.length].clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), agent.seed * Math.PI * 2);
      const start = dir.clone().multiplyScalar(6 + agent.seed * 4);
      const end = dir.clone().multiplyScalar(1.2);
      const pos = start.lerp(end, Math.max(0, agent.progress));
      sprite.position.copy(pos);

      if (badge) {
        badge.position.copy(pos.clone().add(new THREE.Vector3(0.6, 0.4, 0)));
        badge.visible = agent.verified;
      }

      if (!agent.verified) {
        const toCenter = pos.clone().normalize();
        const closest = rayData.reduce((acc, dir) => {
          const dot = dir.dot(toCenter);
          return dot > acc ? dot : acc;
        }, -1);
        const material = sprite.material as THREE.SpriteMaterial;
        if (closest > 0.92 && pos.length() < 4.2) {
          agent.verified = true;
          material.color = new THREE.Color('#3dff9e');
          material.opacity = 1;
        } else {
          material.color = new THREE.Color(agent.type === 'bot' ? '#7bc8ff' : '#ffd36a');
          material.opacity = 0.9;
        }
      }
    });
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={voxelRef} args={[undefined, undefined, voxelCount]}>
        <boxGeometry args={[cubeSize / voxelGrid, cubeSize / voxelGrid, cubeSize / voxelGrid]} />
        <meshStandardMaterial
          vertexColors
          transparent
          opacity={0.4}
          roughness={0.3}
          metalness={0.4}
          emissive="#ff9b3b"
          emissiveIntensity={0.8}
        />
      </instancedMesh>

      <group ref={helixRef}>
        <mesh>
          <tubeGeometry args={[helixCurves.curveA, 280, 0.09, 12, false]} />
          <meshStandardMaterial
            color={helixColors[2] || '#7dffe6'}
            emissive={helixColors[4] || '#8ffff2'}
            emissiveIntensity={2.6}
            transparent
            opacity={0.9}
          />
        </mesh>
        <mesh>
          <tubeGeometry args={[helixCurves.curveB, 280, 0.09, 12, false]} />
          <meshStandardMaterial
            color={helixColors[10] || '#ff7dff'}
            emissive={helixColors[12] || '#ffb7ff'}
            emissiveIntensity={2.6}
            transparent
            opacity={0.9}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.45, 28, 28]} />
          <meshStandardMaterial
            color="#9bfffe"
            emissive="#9bfffe"
            emissiveIntensity={3.2}
            transparent
            opacity={0.9}
          />
        </mesh>
      </group>

      <lineSegments ref={raysRef} geometry={rayGeometry}>
        <lineBasicMaterial color="#7ff6ff" transparent opacity={0.5} />
      </lineSegments>

      {agents.map((agent, i) => (
        <React.Fragment key={`agent-${i}`}>
          <sprite
            ref={(el) => {
              if (el) agentRefs.current[i] = el;
            }}
            scale={[0.9, 0.9, 0.9]}
          >
            <spriteMaterial
              map={agent.type === 'bot' ? emojiTextures.bot || undefined : emojiTextures.human || undefined}
              transparent
              opacity={0.85}
              color={agent.type === 'bot' ? '#7bc8ff' : '#ffd36a'}
            />
          </sprite>
          <sprite
            ref={(el) => {
              if (el) agentBadges.current[i] = el;
            }}
            scale={[0.4, 0.4, 0.4]}
            visible={false}
          >
            <spriteMaterial map={emojiTextures.badge || undefined} transparent opacity={0.95} />
          </sprite>
        </React.Fragment>
      ))}
    </group>
  );
};

export default Helix;
