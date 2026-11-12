/**
 * The world folder stays a client-only leaf: no server modules (only the import-free square packer from @/lib), no
 * wallet context, no network request, no emoji, and no colour literal in an inline style.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '../../src/components/nexus/world');
const files = fs.readdirSync(DIR).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ name: f, src: fs.readFileSync(path.join(DIR, f), 'utf8') }));

describe('the world folder', () => {
  it('holds the new modules', () => {
    expect(files.map((f) => f.name).sort()).toEqual(expect.arrayContaining(['FlatMap.tsx', 'No3dCard.tsx', 'SceneBoundary.tsx', 'caption.ts', 'gl-support.ts']));
  });

  it.each(files.map((f) => [f.name, f.src]))('%s imports nothing from @/lib but the square packer', (_name, src) => {
    const libs = Array.from(src.matchAll(/from\s+['"](@\/lib\/[^'"]+)['"]/g)).map((m) => m[1]);
    for (const l of libs) expect(l).toBe('@/lib/square-packing');
  });

  it.each(files.map((f) => [f.name, f.src]))('%s: no wallet context, no fetch, no emoji', (_name, src) => {
    expect(src).not.toContain('useGlobalWallet');
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it.each(files.map((f) => [f.name, f.src]))('%s: no colour literal in an inline style', (_name, src) => {
    const styles = Array.from(src.matchAll(/style=\{\{([\s\S]*?)\}\}/g)).map((m) => m[1]);
    for (const s of styles) {
      expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(s).not.toMatch(/rgba?\(/);
    }
  });
});
