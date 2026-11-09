/*
 * Which key presses belong to the page, not to the camera. Both world camera controllers listen on `window`; a key
 * typed into a field, or Space / Enter on a focused button or link, must not also move the camera. Key releases are
 * never ignored, so a key pressed on the canvas and released inside a field cannot stay held.
 */

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATE_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);
const ACTIVATE_ROLES = new Set(['button', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'link']);

interface KeyLike {
  code: string;
  target: EventTarget | null;
  defaultPrevented?: boolean;
}

function asElement(target: EventTarget | null): HTMLElement | null {
  if (!target || typeof (target as Node).nodeType !== 'number' || (target as Node).nodeType !== 1) return null;
  return target as HTMLElement;
}

export function controllerIgnoresKey(e: KeyLike): boolean {
  if (e.defaultPrevented) return true;
  const el = asElement(e.target);
  if (!el) return false;
  if (FIELD_TAGS.has(el.tagName) || el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
  if (!ACTIVATE_KEYS.has(e.code)) return false;
  if (el.tagName === 'BUTTON' || el.tagName === 'SUMMARY') return true;
  if (el.tagName === 'A' && el.hasAttribute('href')) return true;
  const role = el.getAttribute('role');
  return role !== null && ACTIVATE_ROLES.has(role);
}
