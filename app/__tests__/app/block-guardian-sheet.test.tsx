/**
 * @jest-environment jsdom
 */

/**
 * The guardian sheet (bg98a item 3): Talk and Leave a message on the block
 * page, through lib/guardian-chat. A 1,000-character cap on the page, the
 * escalation shown as "sent" without the server's text, the page's own 40 s
 * give-up, and no emoji in anything the page itself says.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

// The wallet context pulls in the wallet SDKs (ESM); the sheet only needs `isConnected`.
jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => ({ isConnected: false, walletAddress: null }) }));

import fs from 'fs';
import path from 'path';
import { GuardianAction } from '@/app/(site)/block/[height]/guardian-action';

const HEIGHT = 720143;
const NAME = 'Atlas';
const EMOJI = /\p{Extended_Pictographic}/u;

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return { status, ok: status < 300, headers: { get: (h: string) => headers[h.toLowerCase()] ?? null }, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
});

beforeEach(() => {
  fetchMock.mockReset();
  (global as { fetch?: unknown }).fetch = fetchMock;
  sessionStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Clicks the card's trigger and waits for the sheet, which loads on first open. */
async function open(mode: 'talk' | 'message') {
  render(<GuardianAction height={HEIGHT} name={NAME} mode={mode} />);
  const trigger = screen.getByRole('button', { name: mode === 'talk' ? `Talk to ${NAME}` : `Leave a message for ${NAME}` });
  expect(trigger.getAttribute('data-action')).toBe(mode);
  fireEvent.click(trigger);
  await screen.findByRole('textbox');
}

describe('first load', () => {
  it('the trigger module loads the sheet, the dialog and the chat helper only when someone opens it', () => {
    const P = path.join(__dirname, '..', '..', 'src', 'app', '(site)', 'block', '[height]');
    const src = fs.readFileSync(path.join(P, 'guardian-action.tsx'), 'utf8');
    // Type-only imports are erased at build time and load nothing.
    const staticImports = [...src.matchAll(/^import (?!type )[^;]*from '([^']+)';/gm)].map((m) => m[1]);
    for (const lazy of ['./guardian-sheet', '@/components/ui/sheet', '@/lib/guardian-chat']) expect(staticImports).not.toContain(lazy);
    expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('\.\/guardian-sheet'\)/);
    const card = fs.readFileSync(path.join(P, 'guardian-card.tsx'), 'utf8');
    expect(card).not.toMatch(/from '\.\/guardian-sheet'/);
  });
});

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const send = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

async function say(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  await act(async () => {
    fireEvent.click(send());
  });
}

function pageOwnText(): string {
  // Answer bubbles are the guardian's words, not the page's: leave them out.
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-bubble]').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

describe('the compose box', () => {
  it('1,000 characters can be sent; 1,001 cannot, with a hint', async () => {
    await open('talk');
    fireEvent.change(box(), { target: { value: 'a'.repeat(1000) } });
    expect(send().disabled).toBe(false);
    expect(document.body.textContent).toContain('1,000 / 1,000');
    fireEvent.change(box(), { target: { value: 'a'.repeat(1001) } });
    expect(send().disabled).toBe(true);
    expect(document.body.textContent).toContain('Shorten it by 1 character');
    fireEvent.change(box(), { target: { value: 'a'.repeat(1005) } });
    expect(document.body.textContent).toContain('Shorten it by 5 characters');
  });

  it('says to keep private details out', async () => {
    await open('message');
    expect(document.body.textContent).toContain('Keep private details to yourself.');
  });
});

describe('each answer, said by the page', () => {
  it('talk: the answer is a bubble', async () => {
    fetchMock.mockResolvedValue(reply(200, { response: 'The pond is to the north.', source: 'llm', conversationId: 'c1' }));
    await open('talk');
    await say('Where is the pond?');
    expect(await screen.findByText('The pond is to the north.')).toBeTruthy();
    expect(screen.getByText('Where is the pond?')).toBeTruthy();
    expect(pageOwnText()).not.toMatch(EMOJI);
  });

  it('talk: a proxy failure is a system line, no bubble', async () => {
    fetchMock.mockResolvedValue(reply(200, { response: '[No response from AI]', source: 'llm', conversationId: 'c1' }));
    await open('talk');
    await say('Hi');
    expect(await screen.findByText(`${NAME} couldn't answer right now.`)).toBeTruthy();
    expect(document.body.textContent).not.toContain('No response from AI');
    expect(pageOwnText()).not.toMatch(EMOJI);
  });

  it('message: an escalation shows the sent copy and none of the server string', async () => {
    fetchMock.mockResolvedValue(reply(200, { response: 'Forwarded to the owner \u{1F4E8}', source: 'escalation', conversationId: 'c1' }));
    await open('message');
    await say('Please get in touch');
    expect(await screen.findByText(/^Sent/)).toBeTruthy();
    expect(document.body.textContent).toContain(`Sent · Your message went to ${NAME}'s holder. Replies don't show on this page yet.`);
    expect(document.body.textContent).not.toContain('Forwarded');
    expect(document.body.textContent).not.toMatch(EMOJI);
  });

  it('message: a canned answer is shown as a bubble', async () => {
    fetchMock.mockResolvedValue(reply(200, { response: 'Opening hours are posted at the gate.', source: 'auto-response', conversationId: 'c1' }));
    await open('message');
    await say('When are you open?');
    expect(await screen.findByText('Opening hours are posted at the gate.')).toBeTruthy();
  });

  it('404: not taking messages', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: 'No active guardian on this block' }));
    await open('talk');
    await say('Hi');
    expect(await screen.findByText(`${NAME} isn't taking messages right now.`)).toBeTruthy();
    expect(pageOwnText()).not.toMatch(EMOJI);
  });

  it('429 without Retry-After: no clock time', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'Rate limited' }));
    await open('talk');
    await say('Hi');
    expect(await screen.findByText(`${NAME} has had a lot of messages this hour. Try again later.`)).toBeTruthy();
    expect(document.body.textContent).not.toContain('You can try again at');
    expect(pageOwnText()).not.toMatch(EMOJI);
  });

  it('429 with Retry-After: the clock time', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'Rate limited' }, { 'retry-after': '300' }));
    await open('talk');
    await say('Hi');
    expect(await screen.findByText(/You can try again at \d{1,2}:\d{2}/)).toBeTruthy();
  });

  it('a server error: one plain line and Try again, which resends', async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'Chat failed' }));
    await open('talk');
    await say('Hi');
    expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy();
    expect(pageOwnText()).not.toMatch(EMOJI);
    fetchMock.mockResolvedValueOnce(reply(200, { response: 'Back again.', source: 'llm', conversationId: 'c1' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(await screen.findByText('Back again.')).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).message).toBe('Hi');
  });

  it('no answer in 40 s: the error line', async () => {
    fetchMock.mockImplementation(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    await open('talk');
    jest.useFakeTimers();
    await say('Hi');
    await act(async () => {
      jest.advanceTimersByTime(40_000);
    });
    expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy();
  });
});
