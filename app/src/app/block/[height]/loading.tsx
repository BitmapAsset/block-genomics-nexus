import { Spinner } from '@/components/LoadingSkeleton';

export default function BlockLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Spinner size={24} className="mx-auto text-accent-cyan mb-3" />
        <p className="text-sm text-text-muted">Loading block...</p>
      </div>
    </div>
  );
}
