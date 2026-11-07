/*
 * The world canvas's pixel ratio: phones render at most 1.5x device pixels (44 % fewer pixels than 2.0x
 * on a DPR-3 phone), everything else keeps R3F's default range [1, 2]. Decided once per page load;
 * nothing adapts at run time.
 */
export interface PhoneHints {
  userAgent: string;
  touch: boolean;
  viewportWidth: number;
}

export const PHONE_CANVAS_DPR: [number, number] = [1, 1.5];
export const DEFAULT_CANVAS_DPR: [number, number] = [1, 2];

export function readPhoneHints(): PhoneHints {
  return {
    userAgent: navigator.userAgent || '',
    touch: (navigator.maxTouchPoints || 0) > 0,
    viewportWidth: window.innerWidth,
  };
}

export function isPhoneClass(h: PhoneHints): boolean {
  if (/iPhone|iPod|Android.+Mobile|Mobile Safari|Windows Phone/i.test(h.userAgent)) return true;
  return h.touch && h.viewportWidth < 768;
}

/** One of two shared arrays, so the Canvas prop keeps its reference across renders. */
export function canvasDpr(h: PhoneHints): [number, number] {
  return isPhoneClass(h) ? PHONE_CANVAS_DPR : DEFAULT_CANVAS_DPR;
}

let cached: [number, number] | null = null;

/** The canvas range for this device: read on the first call in a browser, then kept. */
export function deviceCanvasDpr(): [number, number] {
  if (typeof window === 'undefined') return DEFAULT_CANVAS_DPR;
  if (!cached) cached = canvasDpr(readPhoneHints());
  return cached;
}
