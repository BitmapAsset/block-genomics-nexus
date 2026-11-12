/**
 * In Walk and Fly a drag turns the view. R3F still fires a click when the press and the release land on the same
 * object (the instanced parcels are one object), with the drag length in `e.delta` (the straight-line distance from
 * the press to the release). A press that went more than LOOK_DRAG_PX from its press point there is a look, not a
 * click on a parcel, however it ends: the view judges by the larger of `e.delta` and the look tracker's farthest
 * distance, so a drag out and back to the press point is still a look. LOOK_DRAG_PX is the look threshold of both
 * controllers (Walk and Fly turn the camera once that distance is `> LOOK_DRAG_PX`), compared the same way, so no drag
 * both turns the camera and counts as a click. The other views keep every click.
 */
export const LOOK_DRAG_PX = 3;

export function isLookDrag(viewMode: string, dragPx = 0): boolean {
  return (viewMode === 'street' || viewMode === 'flyover') && dragPx > LOOK_DRAG_PX;
}

export interface LookTracker {
  /** A press: records the point and resets the farthest distance to 0. */
  press(x: number, y: number): void;
  /** While pressed: keeps the largest straight-line distance from the press. */
  move(x: number, y: number): void;
  /** Stops tracking and keeps the value (the click arrives after the release). */
  release(): void;
  farthestPx(): number;
}

export function createLookTracker(): LookTracker {
  let pressed = false;
  let x0 = 0;
  let y0 = 0;
  let farthest = 0;
  return {
    press(x, y) {
      pressed = true;
      x0 = x;
      y0 = y;
      farthest = 0;
    },
    move(x, y) {
      if (!pressed) return;
      const d = Math.hypot(x - x0, y - y0);
      if (d > farthest) farthest = d;
    },
    release() {
      pressed = false;
    },
    farthestPx() {
      return farthest;
    },
  };
}
