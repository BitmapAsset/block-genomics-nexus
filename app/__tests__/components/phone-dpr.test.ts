/**
 * The world canvas renders phones at most at 1.5x device pixels and everything else at R3F's default
 * range [1, 2]. The phone rule is the one the world speed branch used (user agent, touch, viewport).
 */
import { canvasDpr, deviceCanvasDpr, isPhoneClass, type PhoneHints } from '@/components/nexus/phone-dpr';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36';

const desk = (o: Partial<PhoneHints> = {}): PhoneHints => ({ userAgent: MAC_UA, touch: false, viewportWidth: 1440, ...o });
const phone = (o: Partial<PhoneHints> = {}): PhoneHints => ({ userAgent: IPHONE_UA, touch: true, viewportWidth: 390, ...o });

describe('device class', () => {
  it('phones by user agent, small touch screens by width', () => {
    expect(isPhoneClass(phone())).toBe(true);
    expect(isPhoneClass(desk())).toBe(false);
    expect(isPhoneClass(desk({ touch: true, viewportWidth: 700 }))).toBe(true);
    expect(isPhoneClass(desk({ touch: true, viewportWidth: 1024 }))).toBe(false);
  });
});

describe('canvas pixel ratio', () => {
  it('caps phones at 1.5 and leaves everything else at [1, 2]', () => {
    expect(canvasDpr(phone())).toEqual([1, 1.5]);
    expect(canvasDpr(phone({ userAgent: ANDROID_UA }))).toEqual([1, 1.5]);
    expect(canvasDpr(desk({ touch: true, viewportWidth: 700 }))).toEqual([1, 1.5]);
    expect(canvasDpr(desk({ touch: true, viewportWidth: 1024 }))).toEqual([1, 2]);
    expect(canvasDpr(desk())).toEqual([1, 2]);
  });

  it('returns one shared array per class, so the canvas prop keeps its reference', () => {
    expect(canvasDpr(phone())).toBe(canvasDpr(phone({ userAgent: ANDROID_UA })));
    expect(canvasDpr(desk())).toBe(canvasDpr(desk({ touch: true, viewportWidth: 1024 })));
    expect(canvasDpr(phone())).not.toBe(canvasDpr(desk()));
  });

  it('without a window it answers [1, 2] and caches nothing', () => {
    expect(typeof window).toBe('undefined');
    expect(deviceCanvasDpr()).toEqual([1, 2]);
  });

  it('a call without a window caches nothing: a later browser call still reads the phone hints', () => {
    const g = globalThis as Record<string, unknown>;
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fresh = require('@/components/nexus/phone-dpr') as typeof import('@/components/nexus/phone-dpr');
        expect(typeof window).toBe('undefined');
        expect(fresh.deviceCanvasDpr()).toEqual([1, 2]);
        Object.defineProperty(globalThis, 'navigator', { value: { userAgent: IPHONE_UA, maxTouchPoints: 5 }, configurable: true });
        g.window = { innerWidth: 390 };
        expect(fresh.deviceCanvasDpr()).toEqual([1, 1.5]);
      });
    } finally {
      delete g.window;
      if (nav) Object.defineProperty(globalThis, 'navigator', nav);
      else delete g.navigator;
    }
  });

  it('in a browser it reads the hints once and keeps the answer', () => {
    const g = globalThis as Record<string, unknown>;
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: IPHONE_UA, maxTouchPoints: 5 }, configurable: true });
    g.window = { innerWidth: 390 };
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fresh = require('@/components/nexus/phone-dpr') as typeof import('@/components/nexus/phone-dpr');
        const first = fresh.deviceCanvasDpr();
        expect(first).toEqual([1, 1.5]);
        Object.defineProperty(globalThis, 'navigator', { value: { userAgent: MAC_UA, maxTouchPoints: 0 }, configurable: true });
        g.window = { innerWidth: 1440 };
        expect(fresh.deviceCanvasDpr()).toBe(first);
      });
    } finally {
      delete g.window;
      if (nav) Object.defineProperty(globalThis, 'navigator', nav);
      else delete g.navigator;
    }
  });
});
