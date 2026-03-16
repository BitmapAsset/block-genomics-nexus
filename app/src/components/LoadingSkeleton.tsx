'use client';

/** Pulsing skeleton block — used across loading.tsx files */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/5 ${className}`}
    />
  );
}

/** Card skeleton matching glass-panel cards */
export function CardSkeleton() {
  return (
    <div className="glass-panel p-5 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

/** Stat card skeleton */
export function StatSkeleton() {
  return (
    <div className="glass-panel p-5 text-center space-y-2">
      <Skeleton className="h-6 w-6 mx-auto rounded" />
      <Skeleton className="h-7 w-16 mx-auto" />
      <Skeleton className="h-3 w-20 mx-auto" />
    </div>
  );
}

/** Full-page loading skeleton with optional title area */
export function PageSkeleton({ cards = 6, showStats = false }: { cards?: number; showStats?: boolean }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      {/* Title area */}
      <div className="mb-10 space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      {/* Search bar */}
      <div className="mb-10">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>

      {/* Optional stats row */}
      {showStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Inline loading spinner for buttons / small areas */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
