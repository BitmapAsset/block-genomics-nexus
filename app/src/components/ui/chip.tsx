/**
 * A status chip: ok (green, only when the data proves it), warn (amber, "can't
 * check right now") or neutral. Never tappable, never red. `chip` names what the
 * chip is about (`data-chip`), so a test can find the deed chip by that and read
 * its tone from `data-tone`.
 */

export type ChipTone = 'ok' | 'warn' | 'neutral';

const TONE: Record<ChipTone, string> = {
  ok: 'border-success/30 bg-success/10 text-ok-text',
  warn: 'border-warn-line bg-warn-soft text-warn-text',
  neutral: 'border-line-2 bg-surface-1 text-text-2',
};

const DOT: Record<ChipTone, string> = {
  ok: 'bg-success',
  warn: 'bg-warn',
  neutral: 'bg-text-3',
};

export default function Chip({
  tone,
  chip,
  state,
  dot = false,
  small = false,
  testId,
  title,
  children,
}: {
  tone: ChipTone;
  /** What the chip is about, e.g. "deed" or "guardian". */
  chip?: string;
  /** The underlying state key, for tests and styling hooks. */
  state?: string;
  dot?: boolean;
  small?: boolean;
  testId?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 font-medium ${
        small ? 'min-h-[26px] text-[12px]' : 'min-h-[30px] text-[12.5px]'
      } leading-5 ${TONE[tone]}`}
      data-tone={tone}
      data-chip={chip}
      data-state={state}
      data-testid={testId}
      title={title}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />}
      <span className="min-w-0">{children}</span>
    </span>
  );
}
