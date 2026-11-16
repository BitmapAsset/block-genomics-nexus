/**
 * The block panel's frame: its widths, the bottom sheet it becomes below md, and its root's classes for each size.
 * Plain strings, so a test reads what an open and a hidden panel get without a browser.
 */
export type RightTab = 'properties' | 'chat' | 'gaming';
export type PanelSize = 'compact' | 'quarter' | 'third' | 'half' | 'hidden';

const PANEL_WIDTHS: Record<PanelSize, string> = { compact: 'w-80', quarter: 'w-96', third: 'w-[33vw]', half: 'w-[50vw]', hidden: 'w-0' };
// Below md a side column would leave the treemap a sliver (QA 2026-10-22 #6), so
// the open panel becomes a bottom sheet over the scene instead, above the back link's row. Below md the hidden panel leaves the flow (max-md:hidden), so the scene column's min-w-0 holds at every width.
const PANEL_SHEET_BELOW_MD = 'max-md:absolute max-md:inset-x-0 max-md:bottom-[calc(72px+env(safe-area-inset-bottom))] max-md:z-30 max-md:!w-full max-md:h-[calc(45vh-72px)] max-md:landscape:min-h-[min(224px,calc(100%-136px))] max-md:rounded-t-2xl max-md:border-t max-md:border-line-2';
const PANEL_EDGE_MD = 'md:border-l md:border-line-2';

/** Open: the side column from md up, the sheet below it. Hidden: w-0 from md up, out of the flow below it. */
export function panelRootClass(size: PanelSize): string {
  const place = size !== 'hidden' ? `${PANEL_SHEET_BELOW_MD} ${PANEL_EDGE_MD}` : 'max-md:hidden';
  return `bp-dark bg-bg-primary ${PANEL_WIDTHS[size]} ${place} flex-shrink-0 flex flex-col transition-all duration-300 motion-reduce:transition-none overflow-hidden`;
}
