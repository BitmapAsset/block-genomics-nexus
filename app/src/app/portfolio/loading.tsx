import { PageSkeleton } from "@/components/LoadingSkeleton";

export default function PortfolioLoading() {
  return <PageSkeleton cards={6} showStats />;
}
