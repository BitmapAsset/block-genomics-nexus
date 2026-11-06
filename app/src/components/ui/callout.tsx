/**
 * A callout box. Amber reads "paused", not "broken": low-alpha fill and border
 * (tokens.md §1). There is no red tone.
 */

export type CalloutTone = 'warn' | 'ok' | 'info';

const TONE: Record<CalloutTone, string> = {
  warn: 'border-warn-line bg-warn-soft',
  ok: 'border-success/30 bg-success/[0.06]',
  info: 'border-line-2 bg-surface-2',
};

const TITLE: Record<CalloutTone, string> = {
  warn: 'text-warn-text',
  ok: 'text-ok-text',
  info: 'text-text-1',
};

export default function Callout({
  tone,
  icon,
  title,
  testId,
  className = '',
  children,
}: {
  tone: CalloutTone;
  icon?: React.ReactNode;
  title: string;
  testId?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex gap-3 rounded-[14px] border p-4 ${TONE[tone]} ${className}`} data-testid={testId} data-tone={tone}>
      {icon && <span className={`mt-0.5 shrink-0 ${TITLE[tone]}`}>{icon}</span>}
      <div className="min-w-0 text-[14px] leading-[1.55]">
        <p className={`font-semibold ${TITLE[tone]}`}>{title}</p>
        {children && <div className="mt-1 text-text-2">{children}</div>}
      </div>
    </div>
  );
}
