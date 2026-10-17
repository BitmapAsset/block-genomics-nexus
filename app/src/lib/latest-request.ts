/**
 * Keeps only the newest of overlapping requests. `begin()` hands out a ticket;
 * `isCurrent(ticket)` turns false once a newer request begins or `cancel()`
 * runs (the box was cleared, or a result was chosen), so an answer that
 * arrives late is dropped instead of reopening a closed dropdown.
 */
export function latestRequest() {
  let current = 0;
  return {
    begin: (): number => ++current,
    isCurrent: (ticket: number): boolean => ticket === current,
    cancel: (): void => {
      current += 1;
    },
  };
}
