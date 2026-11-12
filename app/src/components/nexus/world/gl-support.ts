/**
 * Whether this browser can give the 3D scene a WebGL 2 context (three r163+ needs WebGL 2). The probe's context is
 * released at once, so it does not hold one of the few contexts a phone allows.
 */
export function webgl2Available(doc: Pick<Document, 'createElement'>): boolean {
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
