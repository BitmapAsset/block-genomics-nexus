export default function AdPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex items-center justify-center text-xs text-slate-400 min-h-[90px] ${className}`}>
      {/* AdSense */}
      Advertisement
    </div>
  );
}
