/**
 * The title caption only says what the view does: no parcel count (the seeded layout's count showed when the block's
 * data did not load), no "Drag to rotate" while the tour flies, "Pinch to zoom" on phones.
 */
import fs from 'fs';
import path from 'path';
import { worldCaption } from '@/components/nexus/world/caption';
import type { ViewMode } from '@/components/nexus/ParcelView';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');

describe('the caption per view mode', () => {
  const table: Array<[ViewMode, string | null, string | null]> = [
    ['flyover', null, null],
    ['street', null, null],
    ['standard', null, null],
    ['dna', 'GENOME VIEW', 'GENOME VIEW'],
    ['flat', 'Drag to rotate · Pinch to zoom', 'Drag to rotate · Scroll to zoom'],
    ['isometric', 'Drag to rotate · Pinch to zoom', 'Drag to rotate · Scroll to zoom'],
    ['heights', 'Drag to rotate · Pinch to zoom', 'Drag to rotate · Scroll to zoom'],
  ];

  it.each(table)('%s: phone %p, desktop %p', (mode, phone, desktop) => {
    expect(worldCaption(mode, true)).toBe(phone);
    expect(worldCaption(mode, false)).toBe(desktop);
  });

  it('no caption carries a digit', () => {
    for (const [mode] of table) {
      for (const phone of [true, false]) expect(worldCaption(mode, phone) ?? '').not.toMatch(/\d/);
    }
  });
});

describe('the title block prints the caption, not a count', () => {
  const start = PV.indexOf('{/* Title overlay */}');
  const end = PV.indexOf('<VisitorOverlay', start);
  const title = PV.slice(start, end);

  it('reads worldCaption and neither parcels.length nor "Bitmap layout"', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(title).toContain('worldCaption(viewMode, phone)');
    expect(title).not.toContain('parcels.length');
    expect(title).not.toContain('Bitmap layout');
  });
});
