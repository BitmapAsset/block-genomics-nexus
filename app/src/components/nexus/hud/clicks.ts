/**
 * In Walk and Fly a drag turns the view. R3F still fires a click when the press and the release land on the same
 * object (the instanced parcels are one object), with the drag length in `e.delta`. A click that moved more than
 * LOOK_DRAG_PX there is a look, not a click on a parcel. The other views keep every click.
 */
export const LOOK_DRAG_PX = 4;

export function isLookDrag(viewMode: string, dragPx = 0): boolean {
  return (viewMode === 'street' || viewMode === 'flyover') && dragPx > LOOK_DRAG_PX;
}
