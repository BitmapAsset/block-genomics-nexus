/**
 * @jest-environment jsdom
 */

/**
 * The chat sheet starts loading before the first tap (bg98p item 4): pointing
 * at or focusing the Talk / Leave a message button starts the same import the
 * sheet uses, once, so the sheet is usually ready by the click. The page itself
 * still loads nothing of the sheet (the structure test in
 * block-guardian-sheet.test.tsx keeps the import dynamic).
 *
 * A load that fails (bg98p2 item 3) is not kept: the next hover or focus
 * tries again, and a load that succeeds still happens once.
 *
 * Each test takes a fresh copy of the modules (React included), so the
 * once-only load starts from zero every time.
 */

jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => ({ isConnected: false, walletAddress: null }) }));

let mockSheetLoads = 0;
let mockSheetFailures = 0;
jest.mock('@/app/(site)/block/[height]/guardian-sheet', () => {
  mockSheetLoads += 1;
  if (mockSheetFailures > 0) {
    mockSheetFailures -= 1;
    throw new Error('the chunk did not arrive');
  }
  return { GuardianSheet: () => null };
});

import type * as ReactTypes from 'react';
import type * as ClientTypes from 'react-dom/client';
import type * as ActionTypes from '@/app/(site)/block/[height]/guardian-action';

type ReactModule = typeof ReactTypes;
type Action = typeof ActionTypes;

let React: ReactModule;
let act: ReactModule['act'];
let action: Action;
let root: { render: (el: unknown) => void; unmount: () => void };
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetModules();
  mockSheetLoads = 0;
  mockSheetFailures = 0;
  React = jest.requireActual('react');
  act = React.act;
  const client: typeof ClientTypes = jest.requireActual('react-dom/client');
  action = jest.requireActual('@/app/(site)/block/[height]/guardian-action');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = client.createRoot(host) as unknown as typeof root;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function show(props: { height: number; name: string; mode: 'talk' | 'message' }) {
  await act(async () => root.render(React.createElement(action.GuardianAction, props)));
  await settle();
  const trigger = host.querySelector(`button[data-action="${props.mode}"]`) as HTMLButtonElement;
  expect(trigger).not.toBeNull();
  return trigger;
}

/** What a pointer arriving on the button sends (React's onPointerEnter listens to pointerover). */
function pointAt(el: Element) {
  el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: null }));
}

describe('preloading the chat sheet', () => {
  it('nothing loads with the page; hover starts the load once; focus and a second hover reuse it', async () => {
    const trigger = await show({ height: 720143, name: 'Atlas', mode: 'talk' });
    expect(mockSheetLoads).toBe(0);

    await act(async () => pointAt(trigger));
    await settle();
    expect(mockSheetLoads).toBe(1);

    const first = action.preloadGuardianSheet();
    await act(async () => {
      trigger.focus();
      pointAt(document.body);
      pointAt(trigger);
    });
    await settle();
    expect(action.preloadGuardianSheet()).toBe(first);
    expect(mockSheetLoads).toBe(1);
  });

  it('a failed load is tried again on the next hover; once it succeeds, it is not loaded again', async () => {
    mockSheetFailures = 1;
    const trigger = await show({ height: 612888, name: 'Atlas', mode: 'talk' });
    expect(mockSheetLoads).toBe(0);

    await act(async () => pointAt(trigger));
    await settle();
    expect(mockSheetLoads).toBe(1); // the first try fails

    await act(async () => {
      pointAt(document.body);
      pointAt(trigger);
    });
    await settle();
    expect(mockSheetLoads).toBe(2); // tried again, and this one succeeds
    const loaded = action.preloadGuardianSheet();
    await expect(loaded).resolves.toHaveProperty('GuardianSheet');

    await act(async () => {
      pointAt(document.body);
      pointAt(trigger);
      trigger.focus();
    });
    await settle();
    expect(mockSheetLoads).toBe(2);
    expect(action.preloadGuardianSheet()).toBe(loaded);
  });

  it('a failed load never reaches the page as an error', async () => {
    mockSheetFailures = 1;
    await show({ height: 612888, name: 'Atlas', mode: 'talk' });
    await expect(action.preloadGuardianSheet()).resolves.toBeNull();
    await settle();
    expect(mockSheetLoads).toBe(1);
  });

  it('focus alone starts the load, once', async () => {
    const trigger = await show({ height: 760000, name: 'Mira', mode: 'message' });
    expect(mockSheetLoads).toBe(0);
    await act(async () => {
      trigger.focus();
      trigger.blur();
      trigger.focus();
    });
    await settle();
    expect(mockSheetLoads).toBe(1);
    expect(action.preloadGuardianSheet()).toBe(action.preloadGuardianSheet());
  });
});
