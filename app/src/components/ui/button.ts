/**
 * Button classes for the block page. One orange (primary) button per view: the
 * element that uses it also carries `data-primary`. Everything else is secondary.
 */

export const primaryButton =
  'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-bitcoin px-7 text-[16px] font-semibold text-bitcoin-ink shadow-[0_8px_28px_rgba(247,147,26,0.22)] transition-colors duration-150 hover:bg-bitcoin-hi motion-reduce:transition-none md:min-h-[56px]';

export const secondaryButton =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-line-2 bg-surface-3 px-5 text-[15px] font-medium text-text-1 transition-colors duration-150 hover:bg-white/[0.12] motion-reduce:transition-none';
