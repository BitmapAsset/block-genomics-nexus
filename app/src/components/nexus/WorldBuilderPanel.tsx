'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import GameElementsPanel, { type GameElement } from './GameElementsPanel';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { signedWorldFetch } from '@/lib/world-signing';

/* ─── Types ─── */
export interface WorldObject {
  id: string;
  blockHeight: number;
  ownerAddress: string;
  objectType: string;
  name?: string;
  posX: number; posY: number; posZ: number;
  rotX: number; rotY: number; rotZ: number;
  scaleX: number; scaleY: number; scaleZ: number;
  geometry?: string;
  geoParams?: string;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  transparent?: boolean;
  textureUrl?: string;
  lightType?: string;
  lightIntensity?: number;
  lightDistance?: number;
  lightColor?: string;
  text3d?: string;
  fontSize?: number;
  soundUrl?: string;
  soundVolume?: number;
  soundRadius?: number;
  soundLoop?: boolean;
  effectType?: string;
  effectParams?: string;
  interactive?: boolean;
  clickAction?: string;
  clickData?: string;
  visible?: boolean;
  locked?: boolean;
  layer?: string;
}

export interface TerrainSettings {
  groundColor?: string;
  groundTexture?: string;
  groundMetalness?: number;
  groundRoughness?: number;
  fogEnabled?: boolean;
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
  skyColor?: string;
  skyEnabled?: boolean;
  ambientColor?: string;
  ambientIntensity?: number;
  weather?: string;
}

type ToolMode = 'select' | 'move' | 'rotate' | 'scale';
type Tab = 'objects' | 'terrain' | 'gaming';

interface ObjectTemplate {
  label: string;
  objectType: string;
  geometry?: string;
  lightType?: string;
  effectType?: string;
  color?: string;
  defaults?: Partial<WorldObject>;
}

const OBJECT_LIBRARY: { category: string; icon: string; items: ObjectTemplate[] }[] = [
  {
    category: 'Primitives', icon: '📦', items: [
      { label: 'Box', objectType: 'primitive', geometry: 'box' },
      { label: 'Sphere', objectType: 'primitive', geometry: 'sphere' },
      { label: 'Cylinder', objectType: 'primitive', geometry: 'cylinder' },
      { label: 'Cone', objectType: 'primitive', geometry: 'cone' },
      { label: 'Torus', objectType: 'primitive', geometry: 'torus' },
      { label: 'Plane', objectType: 'primitive', geometry: 'plane' },
      { label: 'Ring', objectType: 'primitive', geometry: 'ring' },
    ],
  },
  {
    category: 'Lights', icon: '💡', items: [
      { label: 'Point Light', objectType: 'light', lightType: 'point', defaults: { lightIntensity: 1, lightDistance: 20, lightColor: '#ffffff' } },
      { label: 'Spot Light', objectType: 'light', lightType: 'spot', defaults: { lightIntensity: 1, lightDistance: 30, lightColor: '#ffffff' } },
      { label: 'Area Light', objectType: 'light', lightType: 'directional', defaults: { lightIntensity: 0.5, lightColor: '#ffffff' } },
    ],
  },
  {
    category: 'Nature', icon: '🌳', items: [
      { label: 'Tree', objectType: 'primitive', geometry: 'cylinder', color: '#2d5a27', defaults: { scaleX: 0.3, scaleZ: 0.3, scaleY: 3 } },
      { label: 'Rock', objectType: 'primitive', geometry: 'sphere', color: '#666666', defaults: { scaleX: 1.5, scaleY: 0.8, scaleZ: 1.2 } },
      { label: 'Water', objectType: 'primitive', geometry: 'plane', color: '#1a6baa', defaults: { opacity: 0.6, transparent: true, metalness: 0.9, scaleX: 5, scaleZ: 5 } },
      { label: 'Grass', objectType: 'primitive', geometry: 'plane', color: '#3a7d2a', defaults: { scaleX: 3, scaleZ: 3 } },
      { label: 'Flower', objectType: 'primitive', geometry: 'sphere', color: '#ff69b4', defaults: { scaleX: 0.3, scaleY: 0.3, scaleZ: 0.3 } },
      { label: 'Bush', objectType: 'primitive', geometry: 'sphere', color: '#2d7a27', defaults: { scaleX: 1.2, scaleY: 0.8, scaleZ: 1.2 } },
    ],
  },
  {
    category: 'Structures', icon: '🏗️', items: [
      { label: 'Wall', objectType: 'primitive', geometry: 'box', color: '#888888', defaults: { scaleX: 5, scaleY: 3, scaleZ: 0.3 } },
      { label: 'Column', objectType: 'primitive', geometry: 'cylinder', color: '#aaaaaa', defaults: { scaleX: 0.4, scaleZ: 0.4, scaleY: 4 } },
      { label: 'Arch', objectType: 'primitive', geometry: 'torus', color: '#999999', defaults: { scaleX: 2, scaleY: 2, scaleZ: 0.5 } },
      { label: 'Stairs', objectType: 'primitive', geometry: 'box', color: '#777777', defaults: { scaleX: 2, scaleY: 0.3, scaleZ: 1 } },
      { label: 'Bridge', objectType: 'primitive', geometry: 'box', color: '#8B7355', defaults: { scaleX: 8, scaleY: 0.2, scaleZ: 2 } },
      { label: 'Tower', objectType: 'primitive', geometry: 'cylinder', color: '#666666', defaults: { scaleX: 1.5, scaleZ: 1.5, scaleY: 8 } },
    ],
  },
  {
    category: 'Effects', icon: '✨', items: [
      { label: 'Particles', objectType: 'effect', effectType: 'particles' },
      { label: 'Fire', objectType: 'effect', effectType: 'fire', color: '#ff4500' },
      { label: 'Portal', objectType: 'effect', effectType: 'portal', color: '#8b00ff' },
      { label: 'Hologram', objectType: 'effect', effectType: 'hologram', color: '#00ffff' },
      { label: 'Fog Zone', objectType: 'effect', effectType: 'fog', color: '#aabbcc' },
      { label: 'Floating Text', objectType: 'text3d', defaults: { text3d: 'Hello', fontSize: 1 } },
    ],
  },
  {
    category: 'Sound', icon: '🔊', items: [
      { label: 'Ambient Sound', objectType: 'sound', defaults: { soundVolume: 0.5, soundRadius: 10, soundLoop: true } },
      { label: 'Music Zone', objectType: 'sound', defaults: { soundVolume: 0.3, soundRadius: 20, soundLoop: true } },
    ],
  },
  {
    category: 'Interactive', icon: '🎯', items: [
      { label: 'Button', objectType: 'primitive', geometry: 'box', color: '#ff3333', defaults: { interactive: true, clickAction: 'message', scaleX: 0.5, scaleY: 0.5, scaleZ: 0.1 } },
      { label: 'Teleporter', objectType: 'effect', effectType: 'portal', defaults: { interactive: true, clickAction: 'teleport', color: '#00ff88' } },
      { label: 'Link Portal', objectType: 'effect', effectType: 'portal', defaults: { interactive: true, clickAction: 'url', color: '#4488ff' } },
      { label: 'Sign', objectType: 'text3d', defaults: { text3d: 'Sign', fontSize: 0.5, interactive: true, clickAction: 'message' } },
    ],
  },
];

const WEATHER_OPTIONS = ['none', 'rain', 'snow', 'storm', 'aurora', 'fireflies'];

/* ─── Slider Component ─── */
function Slider({ label, value, onChange, min = -50, max = 50, step = 0.1 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[10px] w-8 text-right" style={{ color: '#64748b' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-orange-500" style={{ accentColor: '#f7931a' }} />
      <input type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} step={step}
        className="w-14 text-[10px] px-1 py-0.5 rounded text-right" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
    </div>
  );
}

/* ─── Color Picker Row ─── */
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[10px] w-16" style={{ color: '#64748b' }}>{label}</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0" style={{ background: 'none' }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 text-[10px] px-1 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
    </div>
  );
}

/* ─── Main Component ─── */
export default function WorldBuilderPanel({
  blockHeight, ownerAddress, onClose, objects, onObjectsChange, selectedObjectId, onSelectObject,
  terrain, onTerrainChange, toolMode, onToolModeChange,
}: {
  blockHeight: number;
  ownerAddress: string;
  onClose: () => void;
  objects: WorldObject[];
  onObjectsChange: (objects: WorldObject[]) => void;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  terrain: TerrainSettings;
  onTerrainChange: (t: TerrainSettings) => void;
  toolMode: ToolMode;
  onToolModeChange: (m: ToolMode) => void;
}) {
  const [tab, setTab] = useState<Tab>('objects');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Primitives');
  const [saving, setSaving] = useState(false);
  const [undoStack, setUndoStack] = useState<WorldObject[][]>([]);
  const [gameElements, setGameElements] = useState<GameElement[]>([]);
  const [selectedGameElementId, setSelectedGameElementId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const { signMessage, isConnected, walletAddress } = useGlobalWallet();

  // Guarded, action-bound signed request. Returns the parsed JSON on success,
  // or null (and sets authError) on any auth/signing/network failure.
  const runSigned = useCallback(async (opts: {
    method: 'POST' | 'PATCH' | 'DELETE';
    path: string;
    action: string;
    body?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> => {
    setAuthError(null);
    if (!isConnected || !walletAddress) {
      setAuthError('Connect your wallet to edit this world.');
      return null;
    }
    if (walletAddress !== ownerAddress) {
      setAuthError('Switch to the owner wallet for this block to make changes.');
      return null;
    }
    try {
      const res = await signedWorldFetch({
        method: opts.method,
        path: opts.path,
        action: opts.action,
        blockHeight,
        ownerAddress,
        body: opts.body ?? {},
        signMessage,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setAuthError((json?.error as string) || `Request failed (${res.status})`);
        return null;
      }
      return json ?? {};
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Signing failed.');
      return null;
    }
  }, [isConnected, walletAddress, ownerAddress, blockHeight, signMessage]);

  // Debounced signed persist for high-frequency property edits (sliders): apply
  // the change to the scene immediately, then sign+save once the user settles.
  const updateTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingUpdates = useRef<Map<string, Partial<WorldObject>>>(new Map());

  const selectedObject = objects.find(o => o.id === selectedObjectId) || null;

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-20), objects.map(o => ({ ...o }))]);
  }, [objects]);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onObjectsChange(last);
      return prev.slice(0, -1);
    });
  }, [onObjectsChange]);

  const handlePlaceObject = useCallback(async (template: ObjectTemplate) => {
    pushUndo();
    const newObj: Partial<WorldObject> = {
      blockHeight, ownerAddress,
      objectType: template.objectType,
      name: template.label,
      posX: 0, posY: template.defaults?.scaleY ? (template.defaults.scaleY / 2) : 0.5, posZ: 0,
      rotX: 0, rotY: 0, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
      geometry: template.geometry,
      color: template.color || '#f7931a',
      metalness: 0.5, roughness: 0.5, opacity: 1,
      lightType: template.lightType,
      effectType: template.effectType,
      ...template.defaults,
    };

    const data = await runSigned({ method: 'POST', path: '/api/v1/world', action: 'world.create', body: newObj as Record<string, unknown> });
    if (data?.object) {
      onObjectsChange([...objects, data.object as WorldObject]);
      onSelectObject((data.object as WorldObject).id);
    }
  }, [blockHeight, ownerAddress, objects, onObjectsChange, onSelectObject, pushUndo, runSigned]);

  // Flush a settled property edit to the server with one signature.
  const flushUpdate = useCallback(async (id: string) => {
    const updates = pendingUpdates.current.get(id);
    pendingUpdates.current.delete(id);
    updateTimers.current.delete(id);
    if (!updates) return;
    await runSigned({ method: 'PATCH', path: `/api/v1/world/${id}`, action: 'world.update', body: updates as Record<string, unknown> });
  }, [runSigned]);

  const handleUpdateObject = useCallback((id: string, updates: Partial<WorldObject>) => {
    // Apply to the scene immediately for responsive editing.
    onObjectsChange(objects.map(o => o.id === id ? { ...o, ...updates } : o));
    // Coalesce rapid edits (slider drags) and sign+persist once they settle.
    const merged = { ...(pendingUpdates.current.get(id) || {}), ...updates };
    pendingUpdates.current.set(id, merged);
    const existing = updateTimers.current.get(id);
    if (existing) clearTimeout(existing);
    updateTimers.current.set(id, setTimeout(() => { void flushUpdate(id); }, 900));
  }, [objects, onObjectsChange, flushUpdate]);

  const handleDeleteObject = useCallback(async () => {
    if (!selectedObjectId) return;
    const id = selectedObjectId;
    const data = await runSigned({ method: 'DELETE', path: `/api/v1/world/${id}`, action: 'world.delete' });
    if (data) {
      pushUndo();
      onObjectsChange(objects.filter(o => o.id !== id));
      onSelectObject(null);
    }
  }, [selectedObjectId, objects, onObjectsChange, onSelectObject, pushUndo, runSigned]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedObject) return;
    const copy = { ...selectedObject, posX: selectedObject.posX + 2 };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, createdAt, updatedAt, ...data } = copy as WorldObject & { createdAt?: string; updatedAt?: string };

    const result = await runSigned({ method: 'POST', path: '/api/v1/world', action: 'world.create', body: data as Record<string, unknown> });
    if (result?.object) {
      pushUndo();
      onObjectsChange([...objects, result.object as WorldObject]);
      onSelectObject((result.object as WorldObject).id);
    }
  }, [selectedObject, objects, onObjectsChange, onSelectObject, pushUndo, runSigned]);

  const handleSaveTerrain = useCallback(async (updates: Partial<TerrainSettings>) => {
    const newTerrain = { ...terrain, ...updates };
    onTerrainChange(newTerrain);
    await runSigned({ method: 'POST', path: '/api/v1/world/terrain', action: 'world.terrain', body: { blockHeight, ...newTerrain } });
  }, [terrain, onTerrainChange, blockHeight, runSigned]);

  const toolButtons: { mode: ToolMode; icon: string; label: string }[] = [
    { mode: 'select', icon: '🔍', label: 'Select' },
    { mode: 'move', icon: '✋', label: 'Move' },
    { mode: 'rotate', icon: '🔄', label: 'Rotate' },
    { mode: 'scale', icon: '📐', label: 'Scale' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0a0f', color: '#e2e8f0' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#f7931a' }}>🏗️ World Builder</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(247,147,26,0.1)', color: '#f7931a' }}>
            Block #{blockHeight}
          </span>
        </div>
        <button onClick={onClose} className="text-lg hover:opacity-70 transition-opacity" style={{ color: '#64748b' }}>✕</button>
      </div>

      {/* Auth / signing error banner */}
      {authError && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-mono"
          style={{ background: 'rgba(255,68,68,0.12)', borderBottom: '1px solid rgba(255,68,68,0.3)', color: '#ff8888' }}>
          <span>⚠️ {authError}</span>
          <button onClick={() => setAuthError(null)} className="hover:opacity-70" style={{ color: '#ff8888' }}>✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {toolButtons.map(t => (
          <button key={t.mode} onClick={() => onToolModeChange(t.mode)} title={t.label}
            className="px-2 py-1 rounded text-sm transition-all"
            style={{
              background: toolMode === t.mode ? 'rgba(247,147,26,0.2)' : 'transparent',
              border: toolMode === t.mode ? '1px solid rgba(247,147,26,0.4)' : '1px solid transparent',
            }}>
            {t.icon}
          </button>
        ))}
        <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <button onClick={handleDuplicate} title="Duplicate" disabled={!selectedObject}
          className="px-2 py-1 rounded text-sm transition-all hover:bg-white/5 disabled:opacity-30">📋</button>
        <button onClick={handleDeleteObject} title="Delete" disabled={!selectedObject}
          className="px-2 py-1 rounded text-sm transition-all hover:bg-red-500/10 disabled:opacity-30">🗑️</button>
        <button onClick={handleUndo} title="Undo" disabled={undoStack.length === 0}
          className="px-2 py-1 rounded text-sm transition-all hover:bg-white/5 disabled:opacity-30">↩️</button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {(['objects', 'terrain', 'gaming'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 text-[11px] font-mono uppercase tracking-wider transition-all"
            style={{
              color: tab === t ? '#f7931a' : '#64748b',
              borderBottom: tab === t ? '2px solid #f7931a' : '2px solid transparent',
            }}>
            {t === 'objects' ? '📦 Objects' : t === 'terrain' ? '🌍 Terrain' : '🎮 Gaming'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {tab === 'objects' ? (
          <div className="flex flex-col">
            {/* Object Library */}
            <div className="p-2">
              {OBJECT_LIBRARY.map(cat => (
                <div key={cat.category} className="mb-1">
                  <button onClick={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-mono transition-all hover:bg-white/5"
                    style={{ color: expandedCategory === cat.category ? '#f7931a' : '#94a3b8' }}>
                    <span>{cat.icon}</span>
                    <span>{cat.category}</span>
                    <span className="ml-auto text-[9px]">{expandedCategory === cat.category ? '▼' : '▶'}</span>
                  </button>
                  {expandedCategory === cat.category && (
                    <div className="grid grid-cols-2 gap-1 px-1 py-1">
                      {cat.items.map(item => (
                        <button key={item.label} onClick={() => handlePlaceObject(item)}
                          className="px-2 py-2 rounded text-[10px] font-mono text-left transition-all hover:brightness-130"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: '#cbd5e1',
                          }}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Properties Panel */}
            {selectedObject && (
              <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#f7931a' }}>
                  Properties — {selectedObject.name || selectedObject.objectType}
                </div>

                {/* Transform */}
                <div className="mb-3">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Position</div>
                  <Slider label="X" value={selectedObject.posX} onChange={v => handleUpdateObject(selectedObject.id, { posX: v })} />
                  <Slider label="Y" value={selectedObject.posY} onChange={v => handleUpdateObject(selectedObject.id, { posY: v })} />
                  <Slider label="Z" value={selectedObject.posZ} onChange={v => handleUpdateObject(selectedObject.id, { posZ: v })} />
                </div>
                <div className="mb-3">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Rotation</div>
                  <Slider label="X" value={selectedObject.rotX} onChange={v => handleUpdateObject(selectedObject.id, { rotX: v })} min={-180} max={180} step={1} />
                  <Slider label="Y" value={selectedObject.rotY} onChange={v => handleUpdateObject(selectedObject.id, { rotY: v })} min={-180} max={180} step={1} />
                  <Slider label="Z" value={selectedObject.rotZ} onChange={v => handleUpdateObject(selectedObject.id, { rotZ: v })} min={-180} max={180} step={1} />
                </div>
                <div className="mb-3">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Scale</div>
                  <Slider label="X" value={selectedObject.scaleX} onChange={v => handleUpdateObject(selectedObject.id, { scaleX: v })} min={0.01} max={20} step={0.1} />
                  <Slider label="Y" value={selectedObject.scaleY} onChange={v => handleUpdateObject(selectedObject.id, { scaleY: v })} min={0.01} max={20} step={0.1} />
                  <Slider label="Z" value={selectedObject.scaleZ} onChange={v => handleUpdateObject(selectedObject.id, { scaleZ: v })} min={0.01} max={20} step={0.1} />
                </div>

                {/* Material (for primitives) */}
                {selectedObject.objectType === 'primitive' && (
                  <div className="mb-3">
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Material</div>
                    <ColorRow label="Color" value={selectedObject.color || '#f7931a'} onChange={v => handleUpdateObject(selectedObject.id, { color: v })} />
                    <ColorRow label="Emissive" value={selectedObject.emissive || '#000000'} onChange={v => handleUpdateObject(selectedObject.id, { emissive: v })} />
                    <Slider label="Metal" value={selectedObject.metalness ?? 0.5} onChange={v => handleUpdateObject(selectedObject.id, { metalness: v })} min={0} max={1} step={0.01} />
                    <Slider label="Rough" value={selectedObject.roughness ?? 0.5} onChange={v => handleUpdateObject(selectedObject.id, { roughness: v })} min={0} max={1} step={0.01} />
                    <Slider label="Opacity" value={selectedObject.opacity ?? 1} onChange={v => handleUpdateObject(selectedObject.id, { opacity: v, transparent: v < 1 })} min={0} max={1} step={0.01} />
                  </div>
                )}

                {/* Light properties */}
                {selectedObject.objectType === 'light' && (
                  <div className="mb-3">
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Light</div>
                    <ColorRow label="Color" value={selectedObject.lightColor || '#ffffff'} onChange={v => handleUpdateObject(selectedObject.id, { lightColor: v })} />
                    <Slider label="Power" value={selectedObject.lightIntensity ?? 1} onChange={v => handleUpdateObject(selectedObject.id, { lightIntensity: v })} min={0} max={10} step={0.1} />
                    <Slider label="Range" value={selectedObject.lightDistance ?? 20} onChange={v => handleUpdateObject(selectedObject.id, { lightDistance: v })} min={1} max={100} step={1} />
                  </div>
                )}

                {/* Effect properties */}
                {selectedObject.objectType === 'effect' && (
                  <div className="mb-3">
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Effect</div>
                    <ColorRow label="Color" value={selectedObject.color || '#ffffff'} onChange={v => handleUpdateObject(selectedObject.id, { color: v })} />
                  </div>
                )}

                {/* Text3D */}
                {selectedObject.objectType === 'text3d' && (
                  <div className="mb-3">
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Text</div>
                    <input type="text" value={selectedObject.text3d || ''} onChange={e => handleUpdateObject(selectedObject.id, { text3d: e.target.value })}
                      className="w-full text-[11px] px-2 py-1 rounded mb-1" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <Slider label="Size" value={selectedObject.fontSize ?? 1} onChange={v => handleUpdateObject(selectedObject.id, { fontSize: v })} min={0.1} max={5} step={0.1} />
                    <ColorRow label="Color" value={selectedObject.color || '#f7931a'} onChange={v => handleUpdateObject(selectedObject.id, { color: v })} />
                  </div>
                )}

                {/* Interaction */}
                <div className="mb-3">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Interaction</div>
                  <label className="flex items-center gap-2 text-[10px] mb-1 cursor-pointer" style={{ color: '#94a3b8' }}>
                    <input type="checkbox" checked={selectedObject.interactive || false}
                      onChange={e => handleUpdateObject(selectedObject.id, { interactive: e.target.checked })} />
                    Interactive
                  </label>
                  {selectedObject.interactive && (
                    <>
                      <select value={selectedObject.clickAction || ''} onChange={e => handleUpdateObject(selectedObject.id, { clickAction: e.target.value })}
                        className="w-full text-[10px] px-2 py-1 rounded mb-1" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <option value="">No action</option>
                        <option value="url">Open URL</option>
                        <option value="teleport">Teleport</option>
                        <option value="message">Show Message</option>
                        <option value="toggle">Toggle</option>
                      </select>
                      <input type="text" placeholder="URL, coordinates, or message..." value={selectedObject.clickData || ''}
                        onChange={e => handleUpdateObject(selectedObject.id, { clickData: e.target.value })}
                        className="w-full text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Object List */}
            {objects.length > 0 && (
              <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
                  Scene Objects ({objects.length})
                </div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {objects.map(obj => (
                    <button key={obj.id} onClick={() => onSelectObject(obj.id === selectedObjectId ? null : obj.id)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono transition-all text-left"
                      style={{
                        background: obj.id === selectedObjectId ? 'rgba(247,147,26,0.15)' : 'transparent',
                        color: obj.id === selectedObjectId ? '#f7931a' : '#94a3b8',
                      }}>
                      <span style={{ color: obj.color || '#f7931a' }}>●</span>
                      <span className="truncate">{obj.name || obj.objectType}</span>
                      {obj.locked && <span className="ml-auto">🔒</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : tab === 'terrain' ? (
          /* Terrain Tab */
          <div className="p-3 space-y-3">
            <div>
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Ground</div>
              <ColorRow label="Color" value={terrain.groundColor || '#1a1a1a'} onChange={v => handleSaveTerrain({ groundColor: v })} />
              <Slider label="Metal" value={terrain.groundMetalness ?? 0} onChange={v => handleSaveTerrain({ groundMetalness: v })} min={0} max={1} step={0.01} />
              <Slider label="Rough" value={terrain.groundRoughness ?? 0.8} onChange={v => handleSaveTerrain({ groundRoughness: v })} min={0} max={1} step={0.01} />
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Fog</div>
              <label className="flex items-center gap-2 text-[10px] mb-1 cursor-pointer" style={{ color: '#94a3b8' }}>
                <input type="checkbox" checked={terrain.fogEnabled || false} onChange={e => handleSaveTerrain({ fogEnabled: e.target.checked })} />
                Enable Fog
              </label>
              {terrain.fogEnabled && (
                <>
                  <ColorRow label="Color" value={terrain.fogColor || '#0a0a0f'} onChange={v => handleSaveTerrain({ fogColor: v })} />
                  <Slider label="Near" value={terrain.fogNear ?? 50} onChange={v => handleSaveTerrain({ fogNear: v })} min={1} max={200} step={1} />
                  <Slider label="Far" value={terrain.fogFar ?? 300} onChange={v => handleSaveTerrain({ fogFar: v })} min={10} max={1000} step={10} />
                </>
              )}
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Sky</div>
              <ColorRow label="Color" value={terrain.skyColor || '#0a0a0f'} onChange={v => handleSaveTerrain({ skyColor: v })} />
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Ambient Light</div>
              <ColorRow label="Color" value={terrain.ambientColor || '#ffeedd'} onChange={v => handleSaveTerrain({ ambientColor: v })} />
              <Slider label="Power" value={terrain.ambientIntensity ?? 0.35} onChange={v => handleSaveTerrain({ ambientIntensity: v })} min={0} max={2} step={0.05} />
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Weather</div>
              <select value={terrain.weather || 'none'} onChange={e => handleSaveTerrain({ weather: e.target.value })}
                className="w-full text-[10px] px-2 py-1.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
                {WEATHER_OPTIONS.map(w => (
                  <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        ) : tab === 'gaming' ? (
          <GameElementsPanel
            blockHeight={blockHeight}
            ownerAddress={ownerAddress}
            elements={gameElements}
            onElementsChange={setGameElements}
            selectedElementId={selectedGameElementId}
            onSelectElement={setSelectedGameElementId}
          />
        ) : null}
      </div>
    </div>
  );
}
