'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { xpProgress, ACHIEVEMENT_DEFS } from '@/lib/game-logic';

interface GameStateData {
  score: number;
  xp: number;
  level: number;
  coins: number;
  collected?: string | null;
  questProgress?: string | null;
  achievements?: string | null;
  inventory?: string | null;
}

interface QuestData {
  id: string;
  name: string;
  icon?: string;
  steps: { type: string; target: string; count: number }[];
}

export default function GameHUD({
  blockHeight,
  walletAddress,
  gameState,
  quests,
  newAchievements,
  onDismissAchievement,
}: {
  blockHeight: number;
  walletAddress: string;
  gameState: GameStateData | null;
  quests: QuestData[];
  newAchievements: string[];
  onDismissAchievement: () => void;
}) {
  const [showAchievement, setShowAchievement] = useState<string | null>(null);

  // Show achievement popup
  useEffect(() => {
    if (newAchievements.length > 0) {
      setShowAchievement(newAchievements[0]);
      const timer = setTimeout(() => { setShowAchievement(null); onDismissAchievement(); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [newAchievements, onDismissAchievement]);

  if (!gameState) return null;

  const xp = xpProgress(gameState.xp);
  const achievementDef = showAchievement ? ACHIEVEMENT_DEFS.find(a => a.id === showAchievement) : null;
  const questProgress: Record<string, { step: number; completed: boolean }> = gameState.questProgress ? JSON.parse(gameState.questProgress) : {};
  const inventory: string[] = gameState.inventory ? JSON.parse(gameState.inventory) : [];

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 30, fontFamily: 'monospace' }}>
      {/* Top Left: Score / Coins / XP */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Score */}
        <div style={{
          background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(247,147,26,0.3)',
          borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ color: '#f7931a', fontSize: 18, fontWeight: 'bold' }}>{gameState.score.toLocaleString()}</span>
        </div>

        {/* Coins */}
        <div style={{
          background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,215,0,0.3)',
          borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ fontSize: 16 }}>🪙</span>
          <span style={{ color: '#ffd700', fontSize: 14, fontWeight: 'bold' }}>{gameState.coins.toLocaleString()}</span>
        </div>

        {/* XP Bar */}
        <div style={{
          background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(100,200,255,0.3)',
          borderRadius: 8, padding: '6px 14px', backdropFilter: 'blur(8px)', minWidth: 150,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#64c8ff', fontSize: 10, fontWeight: 'bold' }}>LVL {xp.level}</span>
            <span style={{ color: '#64748b', fontSize: 9 }}>{xp.current}/{xp.needed} XP</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(90deg, #f7931a, #ffcc00)', height: '100%', width: `${xp.percent}%`, borderRadius: 4, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>

      {/* Top Right: Quest Tracker */}
      {quests.length > 0 && (
        <div style={{ position: 'absolute', top: 12, right: 12, maxWidth: 220 }}>
          <div style={{
            background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '8px 12px', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ color: '#f7931a', fontSize: 10, fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📜 Active Quests
            </div>
            {quests.slice(0, 3).map(q => {
              const progress = questProgress[q.id];
              const currentStep = progress?.step ?? 0;
              return (
                <div key={q.id} style={{ marginBottom: 6 }}>
                  <div style={{ color: '#e2e8f0', fontSize: 10, fontWeight: 'bold' }}>{q.icon || '📜'} {q.name}</div>
                  {q.steps.map((step, i) => (
                    <div key={i} style={{
                      color: i < currentStep ? '#00cc44' : i === currentStep ? '#f7931a' : '#475569',
                      fontSize: 9, paddingLeft: 8,
                    }}>
                      {i < currentStep ? '✅' : i === currentStep ? '▸' : '○'} {step.type} {step.count > 1 ? `×${step.count}` : ''}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom: Inventory Bar */}
      {inventory.length > 0 && (
        <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
          {inventory.slice(0, 8).map((item, i) => (
            <div key={i} style={{
              width: 40, height: 40, background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(247,147,26,0.3)', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, backdropFilter: 'blur(8px)',
            }}>
              📦
            </div>
          ))}
        </div>
      )}

      {/* Center: Achievement Popup */}
      {achievementDef && (
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', border: '2px solid #ffd700',
          borderRadius: 12, padding: '16px 32px', textAlign: 'center',
          backdropFilter: 'blur(12px)', boxShadow: '0 0 30px rgba(255,215,0,0.3)',
          animation: 'slideDown 0.5s ease-out',
        }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{achievementDef.icon}</div>
          <div style={{ color: '#ffd700', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>
            Achievement Unlocked!
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 'bold' }}>{achievementDef.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 10 }}>{achievementDef.description}</div>
        </div>
      )}

      {/* Block label */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 8px',
        color: '#475569', fontSize: 9, backdropFilter: 'blur(4px)',
      }}>
        🎮 Block #{blockHeight}
      </div>
    </div>
  );
}
