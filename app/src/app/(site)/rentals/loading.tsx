import { PageSkeleton } from '@/components/LoadingSkeleton';

export default function RentalsLoading() {
  return (
    <div className="min-h-screen" style={{ background: '#0a0a12' }}>
      <PageSkeleton cards={6} />
    </div>
  );
}
