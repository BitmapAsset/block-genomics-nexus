/**
 * REVIEW bg57 P2-3: pressing Enter while a search was in flight closed the
 * dropdown, then the late answer reopened it on the next page. Only the
 * newest request may land.
 */

import { latestRequest } from '@/lib/latest-request';

describe('latestRequest', () => {
  it('drops an answer once a newer request began', () => {
    const latest = latestRequest();
    const first = latest.begin();
    const second = latest.begin();

    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(true);
  });

  it('drops the answer in flight after a cancel (Enter, a click on a result, the clear button)', () => {
    const latest = latestRequest();
    const inFlight = latest.begin();
    latest.cancel();

    expect(latest.isCurrent(inFlight)).toBe(false);
    expect(latest.isCurrent(latest.begin())).toBe(true);
  });

  it('keeps separate boxes independent', () => {
    const header = latestRequest();
    const page = latestRequest();
    const h = header.begin();
    page.begin();
    page.cancel();

    expect(header.isCurrent(h)).toBe(true);
  });
});
