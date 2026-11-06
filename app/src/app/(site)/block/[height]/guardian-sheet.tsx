'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, MessageCircle, RotateCcw, Send, Wallet } from 'lucide-react';
import Sheet from '@/components/ui/sheet';
import { useGlobalWallet } from '@/context/GlobalWalletContext';
import { openWalletModal } from '@/lib/open-wallet-modal';
import {
  CHAT_MAX_CHARS,
  sendGuardianMessage,
  type GuardianChatMode,
  type GuardianChatResult,
} from '@/lib/guardian-chat';

/**
 * The guardian card's one action and the sheet it opens (bg98a item 3).
 *
 * Talk: this session's turns as bubbles (not restored after a reload) and a
 * compose row. Leave a message: one form; when the route forwards it to the
 * holder the sheet says so and nothing more, because no reply comes back to
 * this page yet. The guardian's own words render as text; everything else here
 * is the page's own copy, in plain words and without emoji.
 */

export const actionButton =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-line-2 bg-surface-3 px-5 text-[15px] font-medium text-text-1 transition-colors duration-150 hover:bg-white/[0.12] motion-reduce:transition-none';

type Turn = { role: 'visitor' | 'guardian'; text: string };
type Line = Exclude<GuardianChatResult, { kind: 'answer' }>;

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function SystemLine({ line, name, onRetry }: { line: Line; name: string; onRetry: () => void }) {
  const base = 'text-[14px] leading-[1.55] text-text-2';
  switch (line.kind) {
    case 'sent':
      return (
        <p className="rounded-[14px] border border-line-2 bg-surface-2 p-4 text-[14px] leading-[1.55] text-text-1" data-testid="guardian-sent">
          {`Sent · Your message went to ${name}'s holder. Replies don't show on this page yet.`}
        </p>
      );
    case 'system-unavailable':
      return <p className={base}>{`${name} couldn't answer right now.`}</p>;
    case 'not-taking':
      return <p className={base}>{`${name} isn't taking messages right now.`}</p>;
    case 'limited':
      return (
        <p className={base}>
          {`${name} has had a lot of messages this hour. Try again later.`}
          {line.retryAt !== undefined && <span className="block">{`You can try again at ${clock(line.retryAt)}.`}</span>}
        </p>
      );
    default:
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className={base}>Something went wrong. Try again.</p>
          <button type="button" onClick={onRetry} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line-2 px-4 text-[14px] text-text-1 hover:bg-surface-3">
            <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
            Try again
          </button>
        </div>
      );
  }
}

export function GuardianSheet({
  height,
  name,
  mode,
  open,
  onClose,
}: {
  height: number;
  name: string;
  mode: GuardianChatMode;
  open: boolean;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<Line | null>(null);
  const [last, setLast] = useState('');

  const over = input.length - CHAT_MAX_CHARS;
  const canSend = input.trim().length > 0 && over <= 0 && !sending;

  const deliver = async (text: string, echo: boolean) => {
    setSending(true);
    setLine(null);
    setLast(text);
    if (echo) setTurns((t) => [...t, { role: 'visitor', text }]);
    const r = await sendGuardianMessage(height, mode, text);
    if (r.kind === 'answer') setTurns((t) => [...t, { role: 'guardian', text: r.text }]);
    else setLine(r);
    setSending(false);
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    const text = input.trim();
    setInput('');
    void deliver(text, true);
  };

  const sent = line?.kind === 'sent';

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'talk' ? `Talk to ${name}` : `Leave a message for ${name}`} testId="guardian-sheet">
      {turns.length > 0 && (
        <ol className="mb-4 flex flex-col gap-2" aria-live="polite">
          {turns.map((t, i) => (
            <li
              key={i}
              data-bubble={t.role}
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] px-4 py-2.5 text-[14.5px] leading-[1.5] ${
                t.role === 'visitor' ? 'self-end bg-bitcoin/[0.14] text-text-1' : 'self-start bg-surface-3 text-text-1'
              }`}
            >
              {t.text}
            </li>
          ))}
        </ol>
      )}

      {sending && <p className="mb-3 text-[13px] text-text-3">Sending…</p>}
      {line && (
        <div className="mb-4" aria-live="polite">
          <SystemLine line={line} name={name} onRetry={() => void deliver(last, false)} />
        </div>
      )}

      {!(mode === 'message' && sent) && (
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor={`guardian-msg-${height}`}>
            {mode === 'talk' ? `Message to ${name}` : `Your message for ${name}`}
          </label>
          <textarea
            id={`guardian-msg-${height}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (mode === 'talk' && e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            rows={mode === 'talk' ? 2 : 5}
            className="w-full resize-none rounded-[14px] border border-line-2 bg-surface-2 px-4 py-3 text-[15px] leading-[1.5] text-text-1 placeholder:text-text-3 focus:border-accent-cyan focus:outline-none"
            placeholder={mode === 'talk' ? `Ask ${name} something` : `Write to ${name}`}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className={`text-[12.5px] tabular-nums ${over > 0 ? 'text-warn-text' : 'text-text-3'}`}>
              {`${input.length.toLocaleString('en-US')} / ${CHAT_MAX_CHARS.toLocaleString('en-US')}`}
              {over > 0 && ` · Shorten it by ${over.toLocaleString('en-US')} ${over === 1 ? 'character' : 'characters'}`}
            </p>
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-line-2 bg-surface-3 px-5 text-[15px] font-medium text-text-1 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={16} strokeWidth={1.75} aria-hidden="true" />
              Send
            </button>
          </div>
        </form>
      )}
      <p className="mt-3 text-[12.5px] text-text-3">Keep private details to yourself.</p>
    </Sheet>
  );
}

/**
 * The card's action: "Talk to <name>" or "Leave a message for <name>". The
 * sheet mounts on first open, so the server HTML carries only the button.
 */
export function GuardianAction({ height, name, mode }: { height: number; name: string; mode: GuardianChatMode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <button
        type="button"
        data-action={mode}
        className={actionButton}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        {mode === 'talk' ? (
          <MessageCircle size={18} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Mail size={18} strokeWidth={1.75} aria-hidden="true" />
        )}
        {mode === 'talk' ? `Talk to ${name}` : `Leave a message for ${name}`}
      </button>
      {mounted && <GuardianSheet height={height} name={name} mode={mode} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The no-guardian card's one prompt: connect a wallet, then set the guardian
 * up from the world. Same height either way, so connecting shifts nothing.
 */
export function GuardianHoldPrompt({ height }: { height: number }) {
  const { isConnected } = useGlobalWallet();
  const cls = 'inline-flex min-h-[44px] items-center gap-2 text-[14.5px] font-medium text-accent-cyan hover:underline';
  if (isConnected) {
    return (
      <Link href={`/world/${height}`} className={cls} data-testid="guardian-setup">
        Set it up from the world
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => openWalletModal()} className={cls} data-testid="guardian-connect">
      <Wallet size={16} strokeWidth={1.75} aria-hidden="true" />
      Hold this block? Connect your wallet
    </button>
  );
}
