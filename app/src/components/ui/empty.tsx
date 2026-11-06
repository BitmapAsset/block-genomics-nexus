/** An honest empty state: says what is absent without dressing it up as an error. */
export default function Empty({
  icon,
  title,
  testId,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  testId?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-line-3 px-6 py-8 text-center" data-testid={testId}>
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-text-2">{icon}</div>}
      <p className="text-[15px] font-semibold text-text-1">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-xl text-[14px] leading-[1.55] text-text-2">{children}</div>}
    </div>
  );
}
