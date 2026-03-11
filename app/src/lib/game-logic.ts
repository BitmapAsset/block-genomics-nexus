/* ─── Game Logic Layer ─── */

export interface GameElementType {
  gameType: string;
  subType: string;
  label: string;
  icon: string;
  color: string;
  glowColor: string;
  animation: string;
  particleEffect?: string;
  rewardType?: string;
  rewardAmount?: number;
  triggerType: string;
  triggerRadius: number;
  geometry: string;
  category: string;
}

export const GAME_ELEMENT_TYPES: GameElementType[] = [
  // ─── Collectibles & Rewards ───
  { gameType: 'collectible', subType: 'coin', label: 'Coin', icon: '🪙', color: '#ffd700', glowColor: '#ffaa00', animation: 'bounce', particleEffect: 'sparkle', rewardType: 'points', rewardAmount: 10, triggerType: 'proximity', triggerRadius: 2, geometry: 'cylinder', category: 'Collectibles & Rewards' },
  { gameType: 'collectible', subType: 'gem', label: 'Gem', icon: '💎', color: '#4488ff', glowColor: '#2266dd', animation: 'spin', particleEffect: 'sparkle', rewardType: 'points', rewardAmount: 50, triggerType: 'proximity', triggerRadius: 2, geometry: 'octahedron', category: 'Collectibles & Rewards' },
  { gameType: 'collectible', subType: 'chest', label: 'Chest', icon: '🎁', color: '#8B4513', glowColor: '#f7931a', animation: 'pulse', particleEffect: 'burst', rewardType: 'item', rewardAmount: 1, triggerType: 'click', triggerRadius: 3, geometry: 'box', category: 'Collectibles & Rewards' },
  { gameType: 'collectible', subType: 'trophy', label: 'Trophy', icon: '🏆', color: '#ffd700', glowColor: '#ffcc00', animation: 'float', particleEffect: 'ring', rewardType: 'badge', rewardAmount: 1, triggerType: 'click', triggerRadius: 2, geometry: 'cone', category: 'Collectibles & Rewards' },
  { gameType: 'collectible', subType: 'star', label: 'Star', icon: '⭐', color: '#ffee00', glowColor: '#ffdd00', animation: 'orbit', particleEffect: 'sparkle', rewardType: 'xp', rewardAmount: 100, triggerType: 'proximity', triggerRadius: 2, geometry: 'octahedron', category: 'Collectibles & Rewards' },
  { gameType: 'collectible', subType: 'key', label: 'Key', icon: '🔑', color: '#ffd700', glowColor: '#cc9900', animation: 'spin', rewardType: 'item', rewardAmount: 1, triggerType: 'proximity', triggerRadius: 2, geometry: 'box', category: 'Collectibles & Rewards' },
  { gameType: 'collectible', subType: 'lootbox', label: 'Loot Box', icon: '📦', color: '#9933ff', glowColor: '#7700cc', animation: 'pulse', particleEffect: 'burst', rewardType: 'item', rewardAmount: 1, triggerType: 'click', triggerRadius: 3, geometry: 'box', category: 'Collectibles & Rewards' },

  // ─── Race & Checkpoints ───
  { gameType: 'checkpoint', subType: 'start_line', label: 'Start Line', icon: '🏁', color: '#00ff00', glowColor: '#00cc00', animation: 'pulse', triggerType: 'proximity', triggerRadius: 3, geometry: 'torus', category: 'Race & Checkpoints' },
  { gameType: 'checkpoint', subType: 'finish_line', label: 'Finish Line', icon: '🏁', color: '#ff0000', glowColor: '#cc0000', animation: 'pulse', particleEffect: 'burst', triggerType: 'proximity', triggerRadius: 3, geometry: 'torus', category: 'Race & Checkpoints' },
  { gameType: 'checkpoint', subType: 'checkpoint_gate', label: 'Checkpoint Gate', icon: '🔵', color: '#00aaff', glowColor: '#0088dd', animation: 'spin', triggerType: 'proximity', triggerRadius: 3, geometry: 'torus', category: 'Race & Checkpoints' },
  { gameType: 'checkpoint', subType: 'speed_ring', label: 'Speed Ring', icon: '⚡', color: '#ffcc00', glowColor: '#ff9900', animation: 'spin', particleEffect: 'ring', triggerType: 'proximity', triggerRadius: 2, geometry: 'torus', category: 'Race & Checkpoints' },

  // ─── Challenges ───
  { gameType: 'target', subType: 'shooting_target', label: 'Target', icon: '🎯', color: '#ff3333', glowColor: '#cc0000', animation: 'pulse', triggerType: 'click', triggerRadius: 5, geometry: 'cylinder', category: 'Challenges' },
  { gameType: 'target', subType: 'moving_target', label: 'Moving Target', icon: '🎯', color: '#ff6600', glowColor: '#cc4400', animation: 'orbit', triggerType: 'click', triggerRadius: 5, geometry: 'sphere', category: 'Challenges' },
  { gameType: 'target', subType: 'breakable', label: 'Breakable', icon: '💥', color: '#aa5500', glowColor: '#ff6600', animation: 'pulse', particleEffect: 'burst', triggerType: 'click', triggerRadius: 3, geometry: 'box', category: 'Challenges' },
  { gameType: 'trigger', subType: 'puzzle_lock', label: 'Puzzle Lock', icon: '🔒', color: '#888888', glowColor: '#aaaaaa', animation: 'pulse', triggerType: 'click', triggerRadius: 2, geometry: 'box', category: 'Challenges' },
  { gameType: 'trigger', subType: 'switch', label: 'Switch', icon: '🔲', color: '#44aa44', glowColor: '#22cc22', animation: 'pulse', triggerType: 'click', triggerRadius: 2, geometry: 'box', category: 'Challenges' },

  // ─── Zones & Triggers ───
  { gameType: 'zone', subType: 'pvp_arena', label: 'PvP Arena', icon: '⚔️', color: '#ff0000', glowColor: '#cc0000', animation: 'pulse', triggerType: 'proximity', triggerRadius: 10, geometry: 'cylinder', category: 'Zones & Triggers' },
  { gameType: 'zone', subType: 'safe_zone', label: 'Safe Zone', icon: '💚', color: '#00cc44', glowColor: '#00ff55', animation: 'pulse', triggerType: 'proximity', triggerRadius: 8, geometry: 'cylinder', category: 'Zones & Triggers' },
  { gameType: 'zone', subType: 'speed_boost', label: 'Speed Boost', icon: '⚡', color: '#ffcc00', glowColor: '#ffaa00', animation: 'pulse', particleEffect: 'trail', triggerType: 'proximity', triggerRadius: 3, geometry: 'cylinder', category: 'Zones & Triggers' },
  { gameType: 'zone', subType: 'jump_pad', label: 'Jump Pad', icon: '🦘', color: '#00ff88', glowColor: '#00cc66', animation: 'bounce', particleEffect: 'burst', triggerType: 'proximity', triggerRadius: 2, geometry: 'cylinder', category: 'Zones & Triggers' },
  { gameType: 'zone', subType: 'teleport_zone', label: 'Teleport Zone', icon: '🌀', color: '#9933ff', glowColor: '#7700cc', animation: 'spin', particleEffect: 'ring', triggerType: 'proximity', triggerRadius: 3, geometry: 'cylinder', category: 'Zones & Triggers' },
  { gameType: 'zone', subType: 'gravity_zone', label: 'Gravity Zone', icon: '🌌', color: '#3333aa', glowColor: '#5555dd', animation: 'float', triggerType: 'proximity', triggerRadius: 5, geometry: 'sphere', category: 'Zones & Triggers' },

  // ─── NPCs & Quests ───
  { gameType: 'npc', subType: 'merchant', label: 'Merchant', icon: '🏪', color: '#88cc44', glowColor: '#66aa22', animation: 'float', triggerType: 'click', triggerRadius: 3, geometry: 'cylinder', category: 'NPCs & Quests' },
  { gameType: 'npc', subType: 'quest_giver', label: 'Quest Giver', icon: '📜', color: '#ffaa00', glowColor: '#ff8800', animation: 'float', triggerType: 'click', triggerRadius: 3, geometry: 'cylinder', category: 'NPCs & Quests' },
  { gameType: 'npc', subType: 'guardian', label: 'Guardian NPC', icon: '🤖', color: '#6666ff', glowColor: '#4444dd', animation: 'float', triggerType: 'click', triggerRadius: 4, geometry: 'cylinder', category: 'NPCs & Quests' },
  { gameType: 'npc', subType: 'guide', label: 'Guide', icon: '🗺️', color: '#44ccaa', glowColor: '#22aa88', animation: 'float', triggerType: 'click', triggerRadius: 3, geometry: 'cylinder', category: 'NPCs & Quests' },
  { gameType: 'trigger', subType: 'dialogue', label: 'Dialogue Trigger', icon: '💬', color: '#ffffff', glowColor: '#cccccc', animation: 'pulse', triggerType: 'proximity', triggerRadius: 3, geometry: 'sphere', category: 'NPCs & Quests' },

  // ─── Scoreboards & UI ───
  { gameType: 'scoreboard', subType: 'leaderboard', label: 'Leaderboard Display', icon: '🏆', color: '#f7931a', glowColor: '#cc7700', animation: 'float', triggerType: 'click', triggerRadius: 5, geometry: 'box', category: 'Scoreboards & UI' },
  { gameType: 'zone', subType: 'score_zone', label: 'Score Zone', icon: '💯', color: '#00ff00', glowColor: '#00cc00', animation: 'pulse', rewardType: 'points', rewardAmount: 5, triggerType: 'proximity', triggerRadius: 4, geometry: 'cylinder', category: 'Scoreboards & UI' },
  { gameType: 'trigger', subType: 'timer_display', label: 'Timer Display', icon: '⏱️', color: '#ff4444', glowColor: '#cc2222', animation: 'pulse', triggerType: 'click', triggerRadius: 3, geometry: 'box', category: 'Scoreboards & UI' },
  { gameType: 'trigger', subType: 'achievement_trigger', label: 'Achievement Trigger', icon: '🎖️', color: '#ffd700', glowColor: '#ffaa00', animation: 'spin', particleEffect: 'burst', triggerType: 'proximity', triggerRadius: 2, geometry: 'octahedron', category: 'Scoreboards & UI' },
];

export const GAME_ELEMENT_CATEGORIES = [
  { category: 'Collectibles & Rewards', icon: '🪙' },
  { category: 'Race & Checkpoints', icon: '🏁' },
  { category: 'Challenges', icon: '🎯' },
  { category: 'Zones & Triggers', icon: '⚡' },
  { category: 'NPCs & Quests', icon: '🤖' },
  { category: 'Scoreboards & UI', icon: '🏆' },
];

/* ─── Trigger Checking ─── */
export function checkTrigger(
  element: { triggerType?: string | null; triggerRadius?: number | null; posX: number; posY: number; posZ: number; triggerData?: string | null },
  playerPos: { x: number; y: number; z: number },
  gameState?: { score?: number; collected?: string | null }
): boolean {
  const dx = element.posX - playerPos.x;
  const dy = element.posY - playerPos.y;
  const dz = element.posZ - playerPos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const radius = element.triggerRadius ?? 2;

  switch (element.triggerType) {
    case 'proximity':
    case 'collision':
      return dist <= radius;
    case 'click':
      return dist <= radius; // click handler checks this before firing
    case 'score_threshold': {
      const data = element.triggerData ? JSON.parse(element.triggerData) : {};
      return (gameState?.score ?? 0) >= (data.scoreNeeded ?? 0) && dist <= radius;
    }
    default:
      return dist <= radius;
  }
}

/* ─── Reward Processing ─── */
export interface RewardResult {
  rewardType: string;
  rewardAmount: number;
  rewardData?: unknown;
  scoreAdd: number;
  coinsAdd: number;
  xpAdd: number;
  inventoryItem?: string;
}

export function processReward(element: {
  rewardType?: string | null;
  rewardAmount?: number | null;
  rewardData?: string | null;
  id: string;
}): RewardResult {
  const rt = element.rewardType || 'points';
  const amount = element.rewardAmount ?? 0;
  const data = element.rewardData ? JSON.parse(element.rewardData) : null;

  const result: RewardResult = { rewardType: rt, rewardAmount: amount, rewardData: data, scoreAdd: 0, coinsAdd: 0, xpAdd: 0 };

  switch (rt) {
    case 'points':
      result.scoreAdd = amount;
      result.xpAdd = Math.floor(amount / 2);
      break;
    case 'sats':
    case 'coins':
      result.coinsAdd = amount;
      result.xpAdd = amount;
      break;
    case 'xp':
      result.xpAdd = amount;
      break;
    case 'badge':
    case 'item':
      result.inventoryItem = element.id;
      result.xpAdd = 25;
      break;
  }
  return result;
}

/* ─── XP Level Curve ─── */
export function calculateLevel(xp: number): number {
  // Each level requires progressively more XP: level N needs N*100 XP
  let level = 1;
  let xpNeeded = 100;
  let totalXp = 0;
  while (totalXp + xpNeeded <= xp) {
    totalXp += xpNeeded;
    level++;
    xpNeeded = level * 100;
  }
  return level;
}

export function xpForNextLevel(level: number): number {
  return (level + 1) * 100;
}

export function xpProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
  const level = calculateLevel(xp);
  let consumed = 0;
  for (let l = 1; l < level; l++) consumed += l * 100;
  const current = xp - consumed;
  const needed = xpForNextLevel(level - 1);
  return { level, current, needed, percent: Math.min(100, (current / needed) * 100) };
}

/* ─── Achievements ─── */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (state: { score: number; xp: number; coins: number; collected?: string | null; totalTimeMs: number }) => boolean;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'first_collect', name: 'First Find', description: 'Collect your first item', icon: '🪙', check: (s) => { const c = s.collected ? JSON.parse(s.collected) : []; return c.length >= 1; } },
  { id: 'collector_10', name: 'Collector', description: 'Collect 10 items', icon: '📦', check: (s) => { const c = s.collected ? JSON.parse(s.collected) : []; return c.length >= 10; } },
  { id: 'collector_50', name: 'Hoarder', description: 'Collect 50 items', icon: '🏠', check: (s) => { const c = s.collected ? JSON.parse(s.collected) : []; return c.length >= 50; } },
  { id: 'score_100', name: 'Century', description: 'Reach 100 points', icon: '💯', check: (s) => s.score >= 100 },
  { id: 'score_1000', name: 'Thousandaire', description: 'Reach 1000 points', icon: '🔥', check: (s) => s.score >= 1000 },
  { id: 'xp_500', name: 'Seasoned', description: 'Earn 500 XP', icon: '⭐', check: (s) => s.xp >= 500 },
  { id: 'explorer', name: 'Explorer', description: 'Spend 10 minutes in a block', icon: '🗺️', check: (s) => s.totalTimeMs >= 600000 },
  { id: 'speed_demon', name: 'Speed Demon', description: 'Collect 5 items in under 60 seconds', icon: '⚡', check: () => false }, // checked separately
  { id: 'rich', name: 'Bitcoin Rich', description: 'Earn 100 coins', icon: '💰', check: (s) => s.coins >= 100 },
  { id: 'level_5', name: 'Leveled Up', description: 'Reach level 5', icon: '🎖️', check: (s) => calculateLevel(s.xp) >= 5 },
];

export function checkAchievements(state: { score: number; xp: number; coins: number; collected?: string | null; achievements?: string | null; totalTimeMs: number }): string[] {
  const existing: string[] = state.achievements ? JSON.parse(state.achievements) : [];
  const newAchievements: string[] = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (!existing.includes(def.id) && def.check(state)) {
      newAchievements.push(def.id);
    }
  }
  return newAchievements;
}
