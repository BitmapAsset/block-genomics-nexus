/**
 * A card: a small uppercase caption with an optional icon and chip on the
 * right, then the body. Border only, no shadow (tokens.md §4).
 */

export default function Card({
  caption,
  icon,
  chip,
  testId,
  className = '',
  children,
}: {
  caption: string;
  icon?: React.ReactNode;
  chip?: React.ReactNode;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-[20px] border border-line-1 bg-surface-1 p-5 md:p-6 ${className}`}
      data-testid={testId}
    >
      <div className="flex min-h-[30px] flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-text-2">
          {icon}
          {caption}
        </h2>
        {chip}
      </div>
      {children}
    </section>
  );
}
