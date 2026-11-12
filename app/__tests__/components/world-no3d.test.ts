/**
 * The world view checks for WebGL 2 before the scene mounts: without it, the card and the flat map stand in, the HUD
 * stays out, and a scene that throws while it renders falls back to the same card. Read from ParcelView's source (the
 * 3D view does not render in jsdom); the browser probe opens the path with WebGL switched off.
 */
import fs from 'fs';
import path from 'path';

const PV = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');

/** The source of one top-level function in ParcelView, up to its closing brace at column 0. */
function fnSource(name: string): string {
  const start = PV.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  return PV.slice(start, PV.indexOf('\n}\n', start));
}

describe('the flat map moved out of ParcelView', () => {
  it('ParcelView renders <FlatMap and no longer defines StandardBitmapCanvas', () => {
    expect(PV).not.toContain('function StandardBitmapCanvas');
    expect(PV).toContain('<FlatMap');
  });

  it('ParcelView requests no comparison image', () => {
    expect(PV).not.toContain('/api/v1/bitmap-image/');
  });

  it('the flat map gets the data state that never draws the seeded layout', () => {
    const at = PV.indexOf('<FlatMap');
    const el = PV.slice(at, PV.indexOf('/>', at));
    expect(el).toContain('dataSource={flatMapData}');
    const lineStart = PV.lastIndexOf('\n', PV.lastIndexOf('\n', at) - 1);
    const wrapper = PV.slice(lineStart, at);
    expect(wrapper).not.toContain('layoutStyle');
    const decl = PV.split('\n').find((l) => l.includes('const flatMapData'));
    expect(decl).toBeDefined();
    expect(decl).toContain('realBlock.txs.length > 0');
  });
});

describe('the WebGL 2 check before the scene', () => {
  const view = fnSource('ParcelView');

  it('the scene state starts from webgl2Available(', () => {
    const decl = view.split('\n').find((l) => l.includes('const [scene, setScene]'));
    expect(decl).toBeDefined();
    expect(decl).toContain('webgl2Available(');
  });

  it('the 3D branch mounts only while the scene is ok, and marks itself', () => {
    const start = view.indexOf('{/* 3D Canvas */}');
    expect(start).toBeGreaterThan(-1);
    const head = view.slice(start, view.indexOf('<Canvas', start));
    expect(head).toContain("scene === 'ok'");
    expect(head).toContain('data-world-scene');
  });

  it('a boundary wraps the one <Canvas>', () => {
    const open = view.indexOf('<SceneBoundary');
    const canvas = view.indexOf('<Canvas');
    const close = view.indexOf('</Canvas>');
    const end = view.indexOf('</SceneBoundary>');
    expect(open).toBeGreaterThan(-1);
    expect(open).toBeLessThan(canvas);
    expect(end).toBeGreaterThan(close);
    expect(view.indexOf('<Canvas', canvas + 1)).toBe(-1);
  });

  it('the HUD mounts only with the scene', () => {
    const at = view.indexOf('<WorldHud');
    expect(at).toBeGreaterThan(-1);
    expect(view.slice(Math.max(0, at - 60), at)).toContain("scene === 'ok' &&");
  });

  it('the card shows only when there is no scene', () => {
    const at = view.indexOf('<No3dCard');
    expect(at).toBeGreaterThan(-1);
    const lineStart = view.lastIndexOf('{', view.lastIndexOf('<div', at));
    expect(view.slice(lineStart, at)).toContain("scene === 'none'");
  });
});
