/**
 * Tests for src/lib/game-logic.ts
 * Covers: trigger checking, reward processing, XP/level system, achievements
 */

import {
  checkTrigger,
  processReward,
  calculateLevel,
  xpForNextLevel,
  xpProgress,
  checkAchievements,
  GAME_ELEMENT_TYPES,
  GAME_ELEMENT_CATEGORIES,
  ACHIEVEMENT_DEFS,
} from '@/lib/game-logic';

import { MOCK_GAME_ELEMENTS, MOCK_GAME_STATE_EMPTY, MOCK_GAME_STATE_ADVANCED } from '../fixtures';

describe('game-logic', () => {
  describe('GAME_ELEMENT_TYPES', () => {
    it('has elements defined', () => {
      expect(GAME_ELEMENT_TYPES.length).toBeGreaterThan(0);
    });

    it('all elements have required fields', () => {
      for (const el of GAME_ELEMENT_TYPES) {
        expect(el.gameType).toBeTruthy();
        expect(el.subType).toBeTruthy();
        expect(el.label).toBeTruthy();
        expect(el.triggerType).toBeTruthy();
        expect(el.triggerRadius).toBeGreaterThan(0);
        expect(el.category).toBeTruthy();
      }
    });

    it('all categories are represented', () => {
      const cats = new Set(GAME_ELEMENT_TYPES.map(e => e.category));
      for (const c of GAME_ELEMENT_CATEGORIES) {
        expect(cats).toContain(c.category);
      }
    });
  });

  describe('checkTrigger()', () => {
    it('triggers proximity when player is within radius', () => {
      const result = checkTrigger(
        MOCK_GAME_ELEMENTS.coin,
        { x: 10, y: 0, z: 11 }, // distance = 1
      );
      expect(result).toBe(true);
    });

    it('does not trigger proximity when player is outside radius', () => {
      const result = checkTrigger(
        MOCK_GAME_ELEMENTS.coin,
        { x: 100, y: 0, z: 100 }, // way too far
      );
      expect(result).toBe(false);
    });

    it('triggers click within radius', () => {
      const result = checkTrigger(
        MOCK_GAME_ELEMENTS.chest,
        { x: 20, y: 0, z: 21 }, // distance = 1, within radius 3
      );
      expect(result).toBe(true);
    });

    it('handles score_threshold trigger', () => {
      const result = checkTrigger(
        MOCK_GAME_ELEMENTS.scoreZone,
        { x: 0, y: 0, z: 1 }, // within radius
        { score: 150 }, // above threshold 100
      );
      expect(result).toBe(true);
    });

    it('score_threshold fails when score too low', () => {
      const result = checkTrigger(
        MOCK_GAME_ELEMENTS.scoreZone,
        { x: 0, y: 0, z: 1 },
        { score: 50 }, // below threshold 100
      );
      expect(result).toBe(false);
    });

    it('score_threshold fails when out of radius even with enough score', () => {
      const result = checkTrigger(
        MOCK_GAME_ELEMENTS.scoreZone,
        { x: 100, y: 100, z: 100 }, // way outside
        { score: 500 },
      );
      expect(result).toBe(false);
    });

    it('handles null trigger type (defaults to proximity)', () => {
      const result = checkTrigger(
        { ...MOCK_GAME_ELEMENTS.coin, triggerType: null },
        { x: 10, y: 0, z: 11 },
      );
      expect(result).toBe(true);
    });

    it('handles null trigger radius (defaults to 2)', () => {
      const result = checkTrigger(
        { ...MOCK_GAME_ELEMENTS.coin, triggerRadius: null },
        { x: 10, y: 0, z: 11 }, // distance = 1, within default 2
      );
      expect(result).toBe(true);
    });

    it('exact boundary: distance equals radius', () => {
      const result = checkTrigger(
        MOCK_GAME_ELEMENTS.coin, // radius = 2
        { x: 12, y: 0, z: 10 }, // distance = 2
      );
      expect(result).toBe(true);
    });

    it('3D distance calculation is correct', () => {
      const result = checkTrigger(
        { ...MOCK_GAME_ELEMENTS.coin, triggerRadius: 5 },
        { x: 13, y: 3, z: 14 }, // distance = sqrt(9+9+16) = sqrt(34) ≈ 5.83
      );
      expect(result).toBe(false);
    });
  });

  describe('processReward()', () => {
    it('processes points reward', () => {
      const result = processReward(MOCK_GAME_ELEMENTS.coin);
      expect(result.rewardType).toBe('points');
      expect(result.scoreAdd).toBe(10);
      expect(result.xpAdd).toBe(5); // floor(10/2)
      expect(result.coinsAdd).toBe(0);
    });

    it('processes coins/sats reward', () => {
      const element = { ...MOCK_GAME_ELEMENTS.coin, rewardType: 'coins', rewardAmount: 50 };
      const result = processReward(element);
      expect(result.coinsAdd).toBe(50);
      expect(result.xpAdd).toBe(50);
      expect(result.scoreAdd).toBe(0);
    });

    it('processes sats reward (same as coins)', () => {
      const element = { ...MOCK_GAME_ELEMENTS.coin, rewardType: 'sats', rewardAmount: 100 };
      const result = processReward(element);
      expect(result.coinsAdd).toBe(100);
      expect(result.xpAdd).toBe(100);
    });

    it('processes XP reward', () => {
      const element = { ...MOCK_GAME_ELEMENTS.coin, rewardType: 'xp', rewardAmount: 200 };
      const result = processReward(element);
      expect(result.xpAdd).toBe(200);
      expect(result.scoreAdd).toBe(0);
      expect(result.coinsAdd).toBe(0);
    });

    it('processes item reward', () => {
      const result = processReward(MOCK_GAME_ELEMENTS.chest);
      expect(result.rewardType).toBe('item');
      expect(result.inventoryItem).toBe('elem-chest-1');
      expect(result.xpAdd).toBe(25);
    });

    it('processes badge reward', () => {
      const element = { ...MOCK_GAME_ELEMENTS.coin, rewardType: 'badge', rewardAmount: 1 };
      const result = processReward(element);
      expect(result.inventoryItem).toBe(element.id);
      expect(result.xpAdd).toBe(25);
    });

    it('handles null rewardType (defaults to points)', () => {
      const element = { ...MOCK_GAME_ELEMENTS.coin, rewardType: null, rewardAmount: 10 };
      const result = processReward(element);
      expect(result.rewardType).toBe('points');
    });

    it('handles null rewardAmount (defaults to 0)', () => {
      const element = { ...MOCK_GAME_ELEMENTS.coin, rewardAmount: null };
      const result = processReward(element);
      expect(result.scoreAdd).toBe(0);
    });
  });

  describe('calculateLevel()', () => {
    it('level 1 at 0 XP', () => expect(calculateLevel(0)).toBe(1));
    it('level 1 at 99 XP', () => expect(calculateLevel(99)).toBe(1));
    it('level 2 at 100 XP', () => expect(calculateLevel(100)).toBe(2));
    it('level 2 at 299 XP', () => expect(calculateLevel(299)).toBe(2));
    it('level 3 at 300 XP', () => expect(calculateLevel(300)).toBe(3));
    // Level 1: 100xp, Level 2: 200xp, Level 3: 300xp => total for level 4 = 600
    it('level 4 at 600 XP', () => expect(calculateLevel(600)).toBe(4));
    it('level 5 at 1000 XP', () => expect(calculateLevel(1000)).toBe(5));
  });

  describe('xpForNextLevel()', () => {
    it('level 1 needs 200 for next', () => expect(xpForNextLevel(1)).toBe(200));
    it('level 2 needs 300 for next', () => expect(xpForNextLevel(2)).toBe(300));
    it('level 5 needs 600 for next', () => expect(xpForNextLevel(5)).toBe(600));
  });

  describe('xpProgress()', () => {
    it('0 XP = level 1, 0 current, 100 needed', () => {
      const p = xpProgress(0);
      expect(p.level).toBe(1);
      expect(p.current).toBe(0);
      expect(p.needed).toBe(100); // xpForNextLevel(0) = (0+1)*100 = 100
      expect(p.percent).toBe(0);
    });

    it('50 XP = level 1, 50 current, 50% of 200 needed', () => {
      // Actually xpForNextLevel(0) = 100, not 200. Let me recalculate.
      // xpForNextLevel(level - 1) where level=1 => xpForNextLevel(0) = (0+1)*100 = 100
      const p = xpProgress(50);
      expect(p.level).toBe(1);
      expect(p.current).toBe(50);
      expect(p.needed).toBe(100); // xpForNextLevel(0) = 100
      expect(p.percent).toBe(50);
    });

    it('150 XP = level 2, 50 into level 2', () => {
      const p = xpProgress(150);
      expect(p.level).toBe(2);
      expect(p.current).toBe(50); // 150 - 100 consumed
      expect(p.needed).toBe(200); // xpForNextLevel(1) = 200
    });
  });

  describe('checkAchievements()', () => {
    it('returns empty for fresh game state', () => {
      const result = checkAchievements(MOCK_GAME_STATE_EMPTY);
      expect(result).toEqual([]);
    });

    it('detects first_collect achievement', () => {
      const state = {
        ...MOCK_GAME_STATE_EMPTY,
        collected: JSON.stringify(['item-1']),
      };
      const result = checkAchievements(state);
      expect(result).toContain('first_collect');
    });

    it('detects score_100 achievement', () => {
      const state = { ...MOCK_GAME_STATE_EMPTY, score: 150 };
      const result = checkAchievements(state);
      expect(result).toContain('score_100');
    });

    it('detects score_1000 achievement', () => {
      const state = { ...MOCK_GAME_STATE_EMPTY, score: 1500 };
      const result = checkAchievements(state);
      expect(result).toContain('score_1000');
    });

    it('detects xp_500 achievement', () => {
      const state = { ...MOCK_GAME_STATE_EMPTY, xp: 600 };
      const result = checkAchievements(state);
      expect(result).toContain('xp_500');
    });

    it('detects explorer achievement (10+ minutes)', () => {
      const state = { ...MOCK_GAME_STATE_EMPTY, totalTimeMs: 700000 };
      const result = checkAchievements(state);
      expect(result).toContain('explorer');
    });

    it('detects rich achievement (100+ coins)', () => {
      const state = { ...MOCK_GAME_STATE_EMPTY, coins: 150 };
      const result = checkAchievements(state);
      expect(result).toContain('rich');
    });

    it('does not return already-earned achievements', () => {
      const result = checkAchievements(MOCK_GAME_STATE_ADVANCED);
      // first_collect and collector_10 already in achievements
      expect(result).not.toContain('first_collect');
      expect(result).not.toContain('collector_10');
    });

    it('returns newly unlocked from advanced state', () => {
      const result = checkAchievements(MOCK_GAME_STATE_ADVANCED);
      // first_collect and collector_10 already in achievements, should not re-appear
      expect(result).not.toContain('first_collect');
      expect(result).not.toContain('collector_10');
      // These should be newly unlocked
      expect(result).toContain('score_1000');
      expect(result).toContain('xp_500');
      expect(result).toContain('rich');
      expect(result).toContain('explorer');
    });

    it('speed_demon never triggers from check (requires manual)', () => {
      const state = {
        ...MOCK_GAME_STATE_EMPTY,
        score: 99999,
        xp: 99999,
        coins: 99999,
        collected: JSON.stringify(Array(100).fill('x')),
        totalTimeMs: 999999999,
      };
      const result = checkAchievements(state);
      expect(result).not.toContain('speed_demon');
    });
  });

  describe('ACHIEVEMENT_DEFS', () => {
    it('all have required fields', () => {
      for (const def of ACHIEVEMENT_DEFS) {
        expect(def.id).toBeTruthy();
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(typeof def.check).toBe('function');
      }
    });

    it('all IDs are unique', () => {
      const ids = ACHIEVEMENT_DEFS.map(d => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
