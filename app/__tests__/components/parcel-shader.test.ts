/**
 * The parcel shader patch: the rise and the breathing run in the vertex shader from two uniforms,
 * so the instance data never has to be rewritten per frame. Exercised on three's own shader sources.
 */
import * as THREE from 'three';
import {
  PARCEL_BREATHE_GLSL, PARCEL_RISE_GLSL, PARCEL_SHADER_HEAD, patchParcelShader, type ParcelUniforms,
} from '@/components/nexus/parcel-shader';

const uniforms = (): ParcelUniforms => ({ uBgTime: { value: 0 }, uBgStart: { value: 0 } });
const shaderFor = (vertexShader: string) =>
  ({ uniforms: {} as Record<string, THREE.IUniform>, vertexShader, fragmentShader: '' }) as unknown as THREE.WebGLProgramParametersWithUniforms;

describe('patchParcelShader', () => {
  it('prepends the instance attributes and the time uniforms to the vertex shader', () => {
    const shader = shaderFor(THREE.ShaderLib.standard.vertexShader);
    patchParcelShader(uniforms(), true)(shader);
    expect(shader.vertexShader.startsWith(PARCEL_SHADER_HEAD)).toBe(true);
    expect(PARCEL_SHADER_HEAD).toContain('attribute vec2 aBgHeight;');
    expect(PARCEL_SHADER_HEAD).toContain('attribute vec2 aBgAnim;');
    expect(PARCEL_SHADER_HEAD).toContain('uniform float uBgTime;');
    expect(PARCEL_SHADER_HEAD).toContain('uniform float uBgStart;');
  });

  it('follows begin_vertex with the rise, once', () => {
    const shader = shaderFor(THREE.ShaderLib.standard.vertexShader);
    patchParcelShader(uniforms(), true)(shader);
    expect(PARCEL_RISE_GLSL.startsWith('#include <begin_vertex>')).toBe(true);
    expect(shader.vertexShader).toContain(PARCEL_RISE_GLSL);
    expect(shader.vertexShader.split('#include <begin_vertex>')).toHaveLength(2);
    expect(PARCEL_RISE_GLSL).toContain('exp(-4.0 * max(uBgTime - uBgStart, 0.0))');
  });

  it('patches color_vertex with the breathing only when asked (the depth material is not)', () => {
    const lit = shaderFor(THREE.ShaderLib.standard.vertexShader);
    patchParcelShader(uniforms(), true)(lit);
    expect(lit.vertexShader).toContain(PARCEL_BREATHE_GLSL);
    expect(PARCEL_BREATHE_GLSL).toContain('sin(uBgTime * 1.5 + aBgAnim.y * 0.1) * aBgAnim.x');

    const unlit = shaderFor(THREE.ShaderLib.standard.vertexShader);
    patchParcelShader(uniforms(), false)(unlit);
    expect(unlit.vertexShader).not.toContain(PARCEL_BREATHE_GLSL);
    expect(unlit.vertexShader).toContain('#include <color_vertex>');
    expect(unlit.vertexShader).toContain(PARCEL_RISE_GLSL);
  });

  it('rises in the depth pass too, so shadows follow the parcels', () => {
    const depth = shaderFor(THREE.ShaderLib.depth.vertexShader);
    patchParcelShader(uniforms(), false)(depth);
    expect(depth.vertexShader.startsWith(PARCEL_SHADER_HEAD)).toBe(true);
    expect(depth.vertexShader).toContain(PARCEL_RISE_GLSL);
  });

  it('passes the uniform objects by reference, so a later time write reaches the shader', () => {
    const u = uniforms();
    const shader = shaderFor(THREE.ShaderLib.standard.vertexShader);
    patchParcelShader(u, true)(shader);
    expect(shader.uniforms.uBgTime).toBe(u.uBgTime);
    expect(shader.uniforms.uBgStart).toBe(u.uBgStart);
    u.uBgTime.value = 12.5;
    u.uBgStart.value = 3;
    expect(shader.uniforms.uBgTime.value).toBe(12.5);
    expect(shader.uniforms.uBgStart.value).toBe(3);
  });
});
