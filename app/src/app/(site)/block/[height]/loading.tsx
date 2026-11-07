/**
 * The block page while it streams: a dark skeleton of the hero box and the
 * three cards in their real sizes, so the page does not jump when it arrives.
 * Still, like the rest of the page above the fold: nothing animates on load.
 */
export default function BlockLoading() {
  return (
    <main className="bp-dark bg-bg-primary" aria-busy="true">
      <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-4 md:px-10 md:pb-16 md:pt-6">
        <div className="h-11" />
        <div
          className="mt-4 grid gap-6 md:rounded-[28px] md:border md:border-line-1 md:p-10 min-[1200px]:grid-cols-[minmax(0,1fr)_576px] min-[1200px]:items-center min-[1200px]:gap-10"
          data-testid="block-loading-hero"
        >
          <div className="-mx-4 aspect-square bg-[#1d1c2e] md:mx-auto md:w-full md:max-w-[576px] md:rounded-[28px] min-[1200px]:col-start-2 min-[1200px]:row-start-1" />
          <div className="min-[1200px]:col-start-1 min-[1200px]:row-start-1">
            <div className="h-4 w-56 rounded-full bg-surface-2" />
            <div className="mt-4 h-[57px] w-64 rounded-[14px] bg-surface-2 md:h-[91px] md:w-96" />
            <div className="mt-4 h-5 w-40 rounded-full bg-surface-2" />
            <div className="mt-6 h-[52px] w-56 rounded-full bg-surface-2 md:h-[56px]" />
          </div>
        </div>
        <div className="mt-6 grid gap-[14px] md:mt-8 md:gap-5 min-[1200px]:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[320px] rounded-[20px] border border-line-1 bg-surface-1" data-testid="block-loading-card" />
          ))}
        </div>
        <span className="sr-only">Loading the block</span>
      </div>
    </main>
  );
}
