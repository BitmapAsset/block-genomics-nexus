import type * as THREE from 'three';

/*
 * The parcel InstancedMesh's vertex shader patch. The rise-in (exponential approach to the target height,
 * rate 4/s) and the colour breathing run here from a time uniform, so the instance data is written once
 * per data/view change instead of every frame. aBgHeight = (start height, target height);
 * aBgAnim = (breathing amplitude, instance index).
 */
export const PARCEL_SHADER_HEAD = `
attribute vec2 aBgHeight;
attribute vec2 aBgAnim;
uniform float uBgTime;
uniform float uBgStart;
`;

export const PARCEL_RISE_GLSL = `#include <begin_vertex>
  float bgK = exp(-4.0 * max(uBgTime - uBgStart, 0.0));
  float bgH = aBgHeight.y + (aBgHeight.x - aBgHeight.y) * bgK;
  transformed.y *= bgH / max(aBgHeight.y, 1e-4);`;

export const PARCEL_BREATHE_GLSL = `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vColor.xyz *= 1.0 + sin(uBgTime * 1.5 + aBgAnim.y * 0.1) * aBgAnim.x;
#endif`;

export type ParcelUniforms = { uBgTime: { value: number }; uBgStart: { value: number } };

/** onBeforeCompile for the parcel materials; the depth material passes breathe = false (no colour there). */
export function patchParcelShader(uniforms: ParcelUniforms, breathe: boolean) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBgTime = uniforms.uBgTime;
    shader.uniforms.uBgStart = uniforms.uBgStart;
    let vs = PARCEL_SHADER_HEAD + shader.vertexShader.replace('#include <begin_vertex>', PARCEL_RISE_GLSL);
    if (breathe) vs = vs.replace('#include <color_vertex>', PARCEL_BREATHE_GLSL);
    shader.vertexShader = vs;
  };
}
