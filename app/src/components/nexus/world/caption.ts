import type { ViewMode } from '../ParcelView';

/**
 * The line under the block's title: what the view does, never a count. The tour, Walk and the flat map need no line
 * (nothing there rotates or zooms by drag); Genome names itself; the orbit views say how to move them.
 */
export function worldCaption(mode: ViewMode, phone: boolean): string | null {
  switch (mode) {
    case 'flyover':
    case 'street':
    case 'standard':
      return null;
    case 'dna':
      return 'GENOME VIEW';
    case 'flat':
    case 'isometric':
    case 'heights':
      return phone ? 'Drag to rotate · Pinch to zoom' : 'Drag to rotate · Scroll to zoom';
  }
}
