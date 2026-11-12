/**
 * The WebGL 2 probe that runs before the 3D scene mounts: a missing context, a throwing context request or a throwing
 * document all mean "no 3D"; a context means "3D", and the probe hands that context back at once.
 */
import { webgl2Available } from '@/components/nexus/world/gl-support';

type Doc = Pick<Document, 'createElement'>;

function docWith(getContext: () => unknown): Doc {
  return { createElement: (() => ({ getContext })) as unknown as Document['createElement'] };
}

describe('webgl2Available', () => {
  it('is false when the browser gives no WebGL 2 context', () => {
    const getContext = jest.fn(() => null);
    expect(webgl2Available(docWith(getContext))).toBe(false);
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });

  it('is true for a context, and releases that context once', () => {
    const loseContext = jest.fn();
    const getExtension = jest.fn((name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null));
    expect(webgl2Available(docWith(() => ({ getExtension })))).toBe(true);
    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('is false when the context request throws', () => {
    expect(webgl2Available(docWith(() => { throw new Error('blocked'); }))).toBe(false);
  });

  it('is false when the document cannot make a canvas', () => {
    const doc = { createElement: (() => { throw new Error('no canvas'); }) as unknown as Document['createElement'] };
    expect(webgl2Available(doc)).toBe(false);
  });
});
