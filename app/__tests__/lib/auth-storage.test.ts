/**
 * Tests for src/lib/auth-storage.ts
 * Covers: localStorage read/write, SSR safety, handle/profile registries
 */

import {
  readStorage,
  writeStorage,
  getHandleRegistry,
  setHandleRegistry,
  getProfileRegistry,
  setProfileRegistry,
  STORAGE_KEYS,
} from '@/lib/auth-storage';

// Mock localStorage
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: jest.fn((key: string) => mockStorage[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: jest.fn((key: string) => { delete mockStorage[key]; }),
  clear: jest.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
};

Object.defineProperty(global, 'window', {
  value: { localStorage: mockLocalStorage },
  writable: true,
});

describe('auth-storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  describe('STORAGE_KEYS', () => {
    it('has handles key', () => expect(STORAGE_KEYS.handles).toBe('bg_handles'));
    it('has profiles key', () => expect(STORAGE_KEYS.profiles).toBe('bg_profiles'));
  });

  describe('readStorage()', () => {
    it('returns parsed JSON from localStorage', () => {
      mockStorage['test'] = JSON.stringify({ foo: 'bar' });
      expect(readStorage('test', {})).toEqual({ foo: 'bar' });
    });

    it('returns fallback when key not found', () => {
      expect(readStorage('nonexistent', 'default')).toBe('default');
    });

    it('returns fallback on JSON parse error', () => {
      mockStorage['bad'] = 'not-json';
      expect(readStorage('bad', [])).toEqual([]);
    });
  });

  describe('writeStorage()', () => {
    it('writes JSON to localStorage', () => {
      writeStorage('test-key', { data: 123 });
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify({ data: 123 })
      );
    });
  });

  describe('getHandleRegistry / setHandleRegistry', () => {
    it('returns empty object when no registry', () => {
      expect(getHandleRegistry()).toEqual({});
    });

    it('stores and retrieves handle registry', () => {
      const registry = { 'satoshi': 'bc1q...' };
      setHandleRegistry(registry);
      expect(getHandleRegistry()).toEqual(registry);
    });
  });

  describe('getProfileRegistry / setProfileRegistry', () => {
    it('returns empty object when no registry', () => {
      expect(getProfileRegistry()).toEqual({});
    });

    it('stores and retrieves profile registry', () => {
      const profiles = { 'satoshi': { name: 'Satoshi', tier: 1 } };
      setProfileRegistry(profiles);
      expect(getProfileRegistry()).toEqual(profiles);
    });
  });
});
