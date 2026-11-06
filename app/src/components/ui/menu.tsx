/**
 * A menu panel: 48 px rows under optional group captions. Rows are whatever the
 * caller passes (a button or a link) styled with `menuRow`.
 */

export const menuRow =
  'flex min-h-[48px] w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14.5px] text-text-1 transition-colors duration-150 hover:bg-surface-3 motion-reduce:transition-none';

export function MenuGroup({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      {caption && (
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-3">{caption}</p>
      )}
      {children}
    </div>
  );
}

export default function Menu({
  label,
  testId,
  className = '',
  children,
}: {
  label: string;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className={`w-[300px] max-w-[calc(100vw-32px)] rounded-[16px] border border-line-2 bg-bg-secondary p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)] ${className}`}
    >
      {children}
    </div>
  );
}
