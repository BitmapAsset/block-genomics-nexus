/**
 * Arrival: "Enter the block" (/world/<h>) opens the world in Fly with the tour on; the Nexus map's drill-in keeps the
 * grid; under reduced motion the tour waits for a click. Source checks: ParcelView cannot be imported by this suite
 * (three / R3F), and the two mounts are one line each.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '../../src');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const PV = read('components/nexus/ParcelView.tsx');
const WORLD_CLIENT = read('app/(site)/world/[height]/world-client.tsx');
const NEXUS_MAP = read('components/nexus/NexusMap.tsx');

/** The JSX element `<ParcelView ... />` in a file, as text. */
function parcelViewElement(text: string): string {
  const start = text.indexOf('<ParcelView');
  expect(start).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf('/>', start) + 2);
}

describe('arrival', () => {
  it('/world/<h> opens in Fly', () => {
    expect(parcelViewElement(WORLD_CLIENT)).toContain('initialViewMode="flyover"');
  });

  it('ParcelView starts in the view it is given, the grid by default', () => {
    expect(PV).toContain("initialViewMode = 'flat' }: Props)");
    expect(PV).toContain('useState<ViewMode>(initialViewMode)');
    expect(PV).toMatch(/initialViewMode\?: ViewMode;/);
  });

  it('the Nexus map keeps the grid', () => {
    expect(parcelViewElement(NEXUS_MAP)).not.toContain('initialViewMode');
  });

  it('the tour starts on unless the visitor asked for reduced motion', () => {
    expect(PV).toMatch(/const \[reducedMotion\] = useState\(\(\) => typeof window !== 'undefined' &&\s*window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches === true\);/);
    expect(PV).toContain('useState(!reducedMotion)');
    expect(PV).toContain('const [autoTour, setAutoTour] = useState(!reducedMotion);');
  });
});
