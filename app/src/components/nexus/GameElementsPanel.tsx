'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { GAME_ELEMENT_TYPES, GAME_ELEMENT_CATEGORIES, type GameElementType } from '@/lib/game-logic';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { signedWorldFetch } from '@/lib/world-signing';

export interface GameElement {
  id: string;
  blockHeight: number;
  ownerAddress: string;
  objectId?: string;
  gameType: string;
  subType?: string;
  rewardType?: string;
  rewardAmount?: number;
  triggerType?: string;
  triggerRadius?: number;
  respawnMs?: number | null;
  maxClaims?: number | null;
  claimCount: number;
  icon?: string;
  label?: string;
  color?: string;
  glowColor?: string;
  animation?: string;
  particleEffect?: string;
  posX: number;
  posY: number;
  posZ: number;
  enabled: boolean;
  visible: boolean;
}

interface QuestStep {
  type: 'collect' | 'visit' | 'interact' | 'score' | 'time';
  target: string;
  count: number;
}

interface Quest {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  steps: QuestStep[];
  rewardType?: string;
  rewardAmount?: number;
}

export default function GameElementsPanel({
  blockHeight,
  ownerAddress,
  elements,
  onElementsChange,
  selectedElementId,
  onSelectElement,
}: {
  blockHeight: number;
  ownerAddress: string;
  elements: GameElement[];
  onElementsChange: (elements: GameElement[]) => void;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
}) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Collectibles & Rewards');
  const [subPanel, setSubPanel] = useState<'library' | 'quests' | 'leaderboard'>('library');
  const [quests, setQuests] = useState<Quest[]>([]);
  const [questName, setQuestName] = useState('');
  const [questSteps, setQuestSteps] = useState<QuestStep[]>([{ type: 'collect', target: '', count: 1 }]);
  const [authError, setAuthError] = useState<string | null>(null);

  const { signMessage, isConnected, walletAddress } = useGlobalWallet();

  const selectedElement = elements.find(e => e.id === selectedElementId) || null;

  // Guarded, action-bound signed request. Returns parsed JSON on success, or
  // null (and sets authError) on any auth/signing/network failure.
  const runSigned = useCallback(async (opts: {
    method: 'POST' | 'PATCH' | 'DELETE';
    path: string;
    action: string;
    body?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> => {
    setAuthError(null);
    if (!isConnected || !walletAddress) {
      setAuthError('Connect your wallet to edit game elements.');
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

  // Fetch elements on mount
  useEffect(() => {
    fetch(`/api/v1/game/elements?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(d => { if (d.elements) onElementsChange(d.elements); })
      .catch(console.error);
    fetch(`/api/v1/game/quests?blockHeight=${blockHeight}`)
      .then(r => r.json())
      .then(d => { if (d.quests) setQuests(d.quests.map((q: { id: string; name: string; description?: string; icon?: string; steps: string; rewardType?: string; rewardAmount?: number }) => ({ ...q, steps: JSON.parse(q.steps) }))); })
      .catch(console.error);
  }, [blockHeight]);

  // Placing a game element is TWO signed writes: first the 3D BlockObject
  // (world.create), then the GameElement (game.create). Each consumes its own
  // one-time nonce, so the user signs twice.
  const handlePlaceElement = useCallback(async (template: GameElementType) => {
    const objData = await runSigned({
      method: 'POST', path: '/api/v1/world', action: 'world.create',
      body: {
        objectType: 'primitive',
        geometry: template.geometry === 'octahedron' ? 'sphere' : template.geometry,
        name: template.label, color: template.color,
        emissive: template.glowColor, emissiveIntensity: 0.5,
        posX: 0, posY: 1, posZ: 0,
        scaleX: 0.5, scaleY: 0.5, scaleZ: 0.5,
        interactive: true, clickAction: 'message', clickData: `${template.icon} ${template.label}`,
      },
    });
    if (!objData) return;
    const object = objData.object as { id?: string } | undefined;

    const data = await runSigned({
      method: 'POST', path: '/api/v1/game/elements', action: 'game.create',
      body: {
        objectId: object?.id,
        gameType: template.gameType, subType: template.subType,
        rewardType: template.rewardType, rewardAmount: template.rewardAmount,
        triggerType: template.triggerType, triggerRadius: template.triggerRadius,
        icon: template.icon, label: template.label,
        color: template.color, glowColor: template.glowColor,
        animation: template.animation, particleEffect: template.particleEffect,
        posX: 0, posY: 1, posZ: 0,
      },
    });
    if (data?.element) {
      onElementsChange([...elements, data.element as GameElement]);
      onSelectElement((data.element as GameElement).id);
    }
  }, [elements, onElementsChange, onSelectElement, runSigned]);

  const handleUpdateElement = useCallback(async (id: string, updates: Partial<GameElement>) => {
    // Optimistic local update; sign+persist after.
    onElementsChange(elements.map(e => e.id === id ? { ...e, ...updates } : e));
    await runSigned({
      method: 'PATCH', path: `/api/v1/game/elements/${id}`, action: 'game.update',
      body: updates as Record<string, unknown>,
    });
  }, [elements, onElementsChange, runSigned]);

  const handleDeleteElement = useCallback(async () => {
    if (!selectedElementId) return;
    const data = await runSigned({
      method: 'DELETE', path: `/api/v1/game/elements/${selectedElementId}`, action: 'game.delete',
    });
    if (data) {
      onElementsChange(elements.filter(e => e.id !== selectedElementId));
      onSelectElement(null);
    }
  }, [selectedElementId, elements, onElementsChange, onSelectElement, runSigned]);

  const handleCreateQuest = useCallback(async () => {
    if (!questName) return;
    try {
      const res = await fetch('/api/v1/game/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockHeight, ownerAddress, name: questName,
          steps: JSON.stringify(questSteps),
          rewardType: 'xp', rewardAmount: 100,
        }),
      });
      const data = await res.json();
      if (data.quest) {
        setQuests([...quests, { ...data.quest, steps: questSteps }]);
        setQuestName('');
        setQuestSteps([{ type: 'collect', target: '', count: 1 }]);
      }
    } catch (err) {
      console.error('[Quest] Create failed:', err);
    }
  }, [blockHeight, ownerAddress, questName, questSteps, quests]);

  return (
    <div className="flex flex-col h-full text-[11px]">
      {/* Sub-panel tabs */}
      <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {([
          { key: 'library' as const, label: '📦 Library' },
          { key: 'quests' as const, label: '📜 Quests' },
          { key: 'leaderboard' as const, label: '🏆 Board' },
        ]).map(t => (
          <button key={t.key} onClick={() => setSubPanel(t.key)}
            className="flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-all"
            style={{
              color: subPanel === t.key ? '#f7931a' : '#64748b',
              borderBottom: subPanel === t.key ? '2px solid #f7931a' : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Auth / signing error banner */}
      {authError && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-mono"
          style={{ background: 'rgba(255,68,68,0.12)', borderBottom: '1px solid rgba(255,68,68,0.3)', color: '#ff8888' }}>
          <span>⚠️ {authError}</span>
          <button onClick={() => setAuthError(null)} className="hover:opacity-70" style={{ color: '#ff8888' }}>✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'thin' }}>
        {subPanel === 'library' && (
          <>
            {/* Element Library */}
            {GAME_ELEMENT_CATEGORIES.map(cat => {
              const items = GAME_ELEMENT_TYPES.filter(t => t.category === cat.category);
              return (
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
                      {items.map(item => (
                        <button key={item.subType} onClick={() => handlePlaceElement(item)}
                          className="px-2 py-2 rounded text-[10px] font-mono text-left transition-all hover:brightness-130 flex items-center gap-1"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: '#cbd5e1',
                          }}>
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Selected Element Properties */}
            {selectedElement && (
              <div className="mt-3 px-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: '#f7931a' }}>
                    {selectedElement.icon} {selectedElement.label || selectedElement.gameType}
                  </span>
                  <button onClick={handleDeleteElement} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-red-500/20" style={{ color: '#ff4444' }}>🗑️</button>
                </div>

                {/* Reward */}
                <div className="mb-2">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Reward</div>
                  <div className="flex gap-1">
                    <select value={selectedElement.rewardType || ''} onChange={e => handleUpdateElement(selectedElement.id, { rewardType: e.target.value } as Partial<GameElement>)}
                      className="flex-1 text-[10px] px-1 py-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <option value="">None</option>
                      <option value="points">Points</option>
                      <option value="coins">Coins</option>
                      <option value="xp">XP</option>
                      <option value="item">Item</option>
                      <option value="badge">Badge</option>
                    </select>
                    <input type="number" value={selectedElement.rewardAmount || 0} onChange={e => handleUpdateElement(selectedElement.id, { rewardAmount: parseInt(e.target.value) } as Partial<GameElement>)}
                      className="w-16 text-[10px] px-1 py-1 rounded text-right" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                </div>

                {/* Trigger */}
                <div className="mb-2">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Trigger</div>
                  <select value={selectedElement.triggerType || ''} onChange={e => handleUpdateElement(selectedElement.id, { triggerType: e.target.value } as Partial<GameElement>)}
                    className="w-full text-[10px] px-1 py-1 rounded mb-1" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <option value="proximity">Proximity</option>
                    <option value="click">Click</option>
                    <option value="collision">Collision</option>
                    <option value="timer">Timer</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px]" style={{ color: '#64748b' }}>Radius</span>
                    <input type="range" min={1} max={20} step={0.5} value={selectedElement.triggerRadius || 2}
                      onChange={e => handleUpdateElement(selectedElement.id, { triggerRadius: parseFloat(e.target.value) } as Partial<GameElement>)}
                      className="flex-1 h-1" style={{ accentColor: '#f7931a' }} />
                    <span className="text-[9px] w-6 text-right font-mono" style={{ color: '#94a3b8' }}>{selectedElement.triggerRadius || 2}</span>
                  </div>
                </div>

                {/* Respawn & Claims */}
                <div className="mb-2">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Behavior</div>
                  <label className="flex items-center gap-2 text-[10px] mb-1 cursor-pointer" style={{ color: '#94a3b8' }}>
                    <input type="checkbox" checked={selectedElement.respawnMs !== null && selectedElement.respawnMs !== undefined}
                      onChange={e => handleUpdateElement(selectedElement.id, { respawnMs: e.target.checked ? 30000 : null } as Partial<GameElement>)} />
                    Respawn
                  </label>
                  {selectedElement.respawnMs && (
                    <div className="flex items-center gap-1 ml-4">
                      <span className="text-[9px]" style={{ color: '#64748b' }}>Delay</span>
                      <input type="number" value={Math.floor((selectedElement.respawnMs || 30000) / 1000)}
                        onChange={e => handleUpdateElement(selectedElement.id, { respawnMs: parseInt(e.target.value) * 1000 } as Partial<GameElement>)}
                        className="w-14 text-[10px] px-1 py-0.5 rounded text-right" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <span className="text-[9px]" style={{ color: '#64748b' }}>sec</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[9px]" style={{ color: '#64748b' }}>Max claims</span>
                    <input type="number" value={selectedElement.maxClaims ?? ''} placeholder="∞"
                      onChange={e => handleUpdateElement(selectedElement.id, { maxClaims: e.target.value ? parseInt(e.target.value) : null } as Partial<GameElement>)}
                      className="w-14 text-[10px] px-1 py-0.5 rounded text-right" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                </div>

                {/* Animation */}
                <div className="mb-2">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Animation</div>
                  <div className="flex flex-wrap gap-1">
                    {['bounce', 'spin', 'pulse', 'float', 'orbit'].map(a => (
                      <button key={a} onClick={() => handleUpdateElement(selectedElement.id, { animation: a } as Partial<GameElement>)}
                        className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
                        style={{
                          background: selectedElement.animation === a ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                          border: selectedElement.animation === a ? '1px solid rgba(247,147,26,0.4)' : '1px solid rgba(255,255,255,0.06)',
                          color: selectedElement.animation === a ? '#f7931a' : '#94a3b8',
                        }}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Particle Effect */}
                <div className="mb-2">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Particles</div>
                  <div className="flex flex-wrap gap-1">
                    {['none', 'sparkle', 'trail', 'burst', 'ring'].map(p => (
                      <button key={p} onClick={() => handleUpdateElement(selectedElement.id, { particleEffect: p === 'none' ? undefined : p } as Partial<GameElement>)}
                        className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
                        style={{
                          background: (selectedElement.particleEffect || 'none') === p ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.03)',
                          border: (selectedElement.particleEffect || 'none') === p ? '1px solid rgba(247,147,26,0.4)' : '1px solid rgba(255,255,255,0.06)',
                          color: (selectedElement.particleEffect || 'none') === p ? '#f7931a' : '#94a3b8',
                        }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Element List */}
            {elements.length > 0 && (
              <div className="mt-2 px-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
                  Game Elements ({elements.length})
                </div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {elements.map(el => (
                    <button key={el.id} onClick={() => onSelectElement(el.id === selectedElementId ? null : el.id)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono transition-all text-left"
                      style={{
                        background: el.id === selectedElementId ? 'rgba(247,147,26,0.15)' : 'transparent',
                        color: el.id === selectedElementId ? '#f7931a' : '#94a3b8',
                      }}>
                      <span>{el.icon || '●'}</span>
                      <span className="truncate">{el.label || el.gameType}</span>
                      <span className="ml-auto text-[8px]" style={{ color: '#475569' }}>{el.claimCount}x</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {subPanel === 'quests' && (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: '#f7931a' }}>📜 Quest Builder</div>

            {/* Create Quest */}
            <div className="space-y-2">
              <input type="text" placeholder="Quest name..." value={questName} onChange={e => setQuestName(e.target.value)}
                className="w-full text-[10px] px-2 py-1.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />

              {questSteps.map((step, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <span className="text-[9px] w-4" style={{ color: '#475569' }}>{i + 1}</span>
                  <select value={step.type} onChange={e => { const s = [...questSteps]; s[i] = { ...s[i], type: e.target.value as QuestStep['type'] }; setQuestSteps(s); }}
                    className="flex-1 text-[9px] px-1 py-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <option value="collect">Collect</option>
                    <option value="visit">Visit</option>
                    <option value="interact">Interact</option>
                    <option value="score">Score</option>
                    <option value="time">Time</option>
                  </select>
                  <input type="number" value={step.count} onChange={e => { const s = [...questSteps]; s[i] = { ...s[i], count: parseInt(e.target.value) }; setQuestSteps(s); }}
                    className="w-10 text-[9px] px-1 py-1 rounded text-center" style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <button onClick={() => setQuestSteps(questSteps.filter((_, j) => j !== i))} className="text-[9px]" style={{ color: '#ff4444' }}>✕</button>
                </div>
              ))}

              <div className="flex gap-1">
                <button onClick={() => setQuestSteps([...questSteps, { type: 'collect', target: '', count: 1 }])}
                  className="flex-1 py-1 rounded text-[9px] font-mono hover:brightness-130"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                  + Step
                </button>
                <button onClick={handleCreateQuest} disabled={!questName}
                  className="flex-1 py-1 rounded text-[9px] font-mono font-bold hover:brightness-130 disabled:opacity-30"
                  style={{ background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.4)', color: '#f7931a' }}>
                  Create Quest
                </button>
              </div>
            </div>

            {/* Quest List */}
            {quests.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Quests ({quests.length})</div>
                {quests.map(q => (
                  <div key={q.id} className="px-2 py-1.5 rounded mb-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>{q.icon || '📜'} {q.name}</div>
                    <div className="text-[9px]" style={{ color: '#64748b' }}>{q.steps.length} steps • {q.rewardType} +{q.rewardAmount}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {subPanel === 'leaderboard' && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: '#f7931a' }}>🏆 Leaderboard Config</div>
            <div className="text-[9px]" style={{ color: '#64748b' }}>
              Categories tracked: score, coins, xp, time
            </div>
            <div className="text-[9px]" style={{ color: '#64748b' }}>
              Leaderboard automatically updates when players claim rewards.
              Place a &quot;Leaderboard Display&quot; element to show scores in-world.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
