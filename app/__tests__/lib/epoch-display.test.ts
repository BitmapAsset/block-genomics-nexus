/**
 * QA 2026-10-22 #13: the viewer panel showed the 0-based epoch index ("EPOCH 3"
 * for 718840) while the block page, its share card and the map say
 * "Epoch 4 · The Adoption Era". Every displayed epoch must be the 1-based label.
 */

import fs from 'fs';
import path from 'path';

import { epochDisplay, epochLabelFor } from '@/lib/bitmapStandard';

const nexusDir = path.join(__dirname, '..', '..', 'src', 'components', 'nexus');
const read = (f: string) => fs.readFileSync(path.join(nexusDir, f), 'utf8');

describe('epoch display', () => {
  it.each([
    [0, 'Epoch 1 · The Genesis Era'],
    [209_999, 'Epoch 1 · The Genesis Era'],
    [210_000, 'Epoch 2 · The Growth Era'],
    [612_888, 'Epoch 3 · The Expansion Era'],
    [718_840, 'Epoch 4 · The Adoption Era'],
    [840_000, 'Epoch 5 · The Scarcity Era'],
    [5_000_000, 'Epoch 5 · The Scarcity Era'],
  ])('%i → %s', (h, want) => {
    expect(epochDisplay(h)).toBe(want);
  });

  it('gives the label and era separately for badges', () => {
    expect(epochLabelFor(718_840)).toMatchObject({ label: 'Epoch 4', sub: 'The Adoption Era' });
  });

  it('never renders the 0-based index in the nexus panels', () => {
    expect(read('ParcelView.tsx')).not.toMatch(/value=\{`\$\{block\.epoch\}`\}/);
    expect(read('ParcelView.tsx')).toMatch(/label="EPOCH" value=\{epochDisplay\(blockHeight\)\}/);
    expect(read('NexusDetailPanel.tsx')).not.toMatch(/Epoch \{block\.epoch\}/);
    expect(read('BlockSpotlight.tsx')).not.toMatch(/Epoch \{getEpoch\(/);
  });
});
