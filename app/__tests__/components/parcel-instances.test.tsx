/** @jest-environment jsdom */
/**
 * The parcel instances are written when the data, the view or the palette changes, never per frame.
 * As in parcel-resource-lifecycle.test.tsx, the component body is extracted from ParcelView.tsx and run
 * with React's hook lifecycle and real Three objects, without a GPU: the mesh ref gets a real
 * InstancedMesh, useFrame's callback is captured and called by hand, useThree returns one clock.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import * as React from 'react';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';

const source = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');
const ast = ts.createSourceFile('ParcelView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['InstancedParcels', 'parseColor', 'MATRIX_SCRATCH', 'COLOR_SCRATCH']);
const declared = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.has(d.name.text)))
);
const parcelsFn = declared.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'InstancedParcels');

type Parcel = { txIndex: number; x: number; z: number; width: number; depth: number; buildHeight: number; color: string; isCoinbase?: boolean };
type Props = {
  parcels: Parcel[]; viewMode: string; hoveredIndex: number; selectedIndex: number;
  onHover: jest.Mock; onClick: jest.Mock; onDoubleClick: jest.Mock; customizations?: Map<number, unknown>;
};
type Env = {
  count: number;
  mesh: THREE.InstancedMesh | null;
  frame: ((state: { clock: { elapsedTime: number } }, delta: number) => void) | null;
  state: { clock: { elapsedTime: number } };
};
type MeshProps = { args: [THREE.BufferGeometry, THREE.Material, number]; onPointerOver: (e: unknown) => void; onPointerOut: () => void };

function makeHarness(env: Env) {
  const shader = jest.requireActual('@/components/nexus/parcel-shader') as { patchParcelShader: unknown };
  const js = ts.transpileModule(declared.map(node => node.getText(ast)).join('\n'),
    { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function('React', 'THREE', 'patchParcelShader', 'env', `
const {useMemo, useEffect, useLayoutEffect, useState, useCallback} = React;
const useRef = init => {
  const ref = React.useRef(init);
  if (init === null && ref.current === null && !env.mesh) {
    env.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), env.count);
  }
  if (init === null && ref.current === null) ref.current = env.mesh;
  return ref;
};
const useFrame = cb => { env.frame = cb; };
const useThree = select => (select ? select(env.state) : env.state);
const CoinbaseOrb = () => null;
${js}
return InstancedParcels;
`)(React, THREE, shader.patchParcelShader, env) as (props: Props) => React.ReactElement;
}

const COUNT = 6;
const makeParcels = (scale = 1): Parcel[] => Array.from({ length: COUNT }, (_, i) => ({
  txIndex: i, x: i * 2, z: 1, width: 1 + i * 0.1, depth: 1, buildHeight: 0.2 * (i + 1) * scale, color: '#f7931a',
}));
const target = (p: Parcel) => Math.max(0.15, p.buildHeight * 4);

function mount(overrides: Partial<Props> = {}) {
  const env: Env = { count: COUNT, mesh: null, frame: null, state: { clock: { elapsedTime: 0 } } };
  const InstancedParcels = makeHarness(env);
  const props: Props = {
    parcels: makeParcels(), viewMode: 'isometric', hoveredIndex: -1, selectedIndex: -1,
    onHover: jest.fn(), onClick: jest.fn(), onDoubleClick: jest.fn(), ...overrides,
  };
  const hook = renderHook((p: Props) => InstancedParcels(p), { initialProps: props });
  return { env, props, hook, mesh: env.mesh as THREE.InstancedMesh };
}

function meshElement(element: React.ReactElement): MeshProps {
  let found: MeshProps | null = null;
  function visit(node: React.ReactNode) {
    React.Children.forEach(node, child => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return;
      if (child.type === 'instancedMesh' && !found) found = child.props as unknown as MeshProps;
      visit(child.props.children);
    });
  }
  visit(element);
  if (!found) throw new Error('no instancedMesh in the parcels element');
  return found;
}

const indicesOf = (spy: jest.SpyInstance) => spy.mock.calls.map(call => call[0] as number).sort((a, b) => a - b);

let setMatrixAt: jest.SpyInstance;
let setColorAt: jest.SpyInstance;
let addUpdateRange: jest.SpyInstance;
beforeEach(() => {
  setMatrixAt = jest.spyOn(THREE.InstancedMesh.prototype, 'setMatrixAt');
  setColorAt = jest.spyOn(THREE.InstancedMesh.prototype, 'setColorAt');
  addUpdateRange = jest.spyOn(THREE.BufferAttribute.prototype, 'addUpdateRange');
});
afterEach(() => jest.restoreAllMocks());
const clearSpies = () => [setMatrixAt, setColorAt, addUpdateRange].forEach(spy => spy.mockClear());

describe('InstancedParcels source shape', () => {
  it('has one useFrame, and it writes no instance matrix, colour or upload flag', () => {
    expect(parcelsFn).toBeDefined();
    const frames: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useFrame') frames.push(node);
      ts.forEachChild(node, visit);
    };
    visit(parcelsFn as ts.Node);
    expect(frames).toHaveLength(1);
    const body = frames[0].arguments[0].getText(ast);
    expect(body).not.toMatch(/setMatrixAt|setColorAt|needsUpdate|new THREE\.Color/);
  });
});

describe('InstancedParcels instance writes', () => {
  it('writes every matrix once on mount and once per data change, at the target height', () => {
    const { hook, props, mesh } = mount();
    expect(indicesOf(setMatrixAt)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(indicesOf(setColorAt)).toEqual([0, 1, 2, 3, 4, 5]);
    clearSpies();
    const next = makeParcels(2);
    hook.rerender({ ...props, parcels: next });
    expect(indicesOf(setMatrixAt)).toEqual([0, 1, 2, 3, 4, 5]);
    const m = new THREE.Matrix4();
    next.forEach((p, i) => {
      mesh.getMatrixAt(i, m);
      expect(m.elements[0]).toBeCloseTo(p.width);
      expect(m.elements[5]).toBeCloseTo(target(p));
      expect(m.elements[12]).toBeCloseTo(p.x);
      expect(m.elements[14]).toBeCloseTo(p.z);
    });
  });

  it('writes no matrix and no colour per frame; the frame only advances the time uniform', () => {
    const { hook, env, mesh } = mount();
    const matrixVersion = mesh.instanceMatrix.version;
    const colorVersion = mesh.instanceColor?.version;
    const material = meshElement(hook.result.current).args[1];
    const compiled = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: '' };
    material.onBeforeCompile(compiled as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    clearSpies();
    for (let i = 1; i <= 120; i++) {
      env.state.clock.elapsedTime = i / 60;
      env.frame?.(env.state, 1 / 60);
    }
    expect(setMatrixAt).not.toHaveBeenCalled();
    expect(setColorAt).not.toHaveBeenCalled();
    expect(addUpdateRange).not.toHaveBeenCalled();
    expect(mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(mesh.instanceColor?.version).toBe(colorVersion);
    expect(compiled.uniforms.uBgTime.value).toBeCloseTo(2);
  });

  it('writes nothing on a re-render with the same props', () => {
    const { hook, props, env, mesh } = mount();
    env.frame?.(env.state, 1 / 60);
    const matrixVersion = mesh.instanceMatrix.version;
    const colorVersion = mesh.instanceColor?.version;
    clearSpies();
    for (let i = 0; i < 20; i++) hook.rerender(props);
    expect(setMatrixAt).not.toHaveBeenCalled();
    expect(setColorAt).not.toHaveBeenCalled();
    expect(addUpdateRange).not.toHaveBeenCalled();
    expect(mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(mesh.instanceColor?.version).toBe(colorVersion);
  });

  it('a hover or selection change rewrites only the instances it touches, as partial ranges', () => {
    const { hook, props, env, mesh } = mount();
    env.frame?.(env.state, 1 / 60);
    clearSpies();
    hook.rerender({ ...props, hoveredIndex: 2 });
    expect(setMatrixAt).not.toHaveBeenCalled();
    expect(indicesOf(setColorAt)).toEqual([2]);
    const colorAttr = mesh.instanceColor as THREE.InstancedBufferAttribute;
    const ranges = addUpdateRange.mock.calls.map((call, i) => ({ attr: addUpdateRange.mock.contexts[i], start: call[0], count: call[1] }));
    expect(ranges).toContainEqual({ attr: colorAttr, start: 6, count: 3 });
    expect(ranges.filter(r => r.attr !== colorAttr)).toEqual([expect.objectContaining({ start: 4, count: 2 })]);
    const c = new THREE.Color();
    mesh.getColorAt(2, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);

    clearSpies();
    hook.rerender({ ...props, hoveredIndex: 4, selectedIndex: 1 });
    expect(setMatrixAt).not.toHaveBeenCalled();
    expect(indicesOf(setColorAt)).toEqual([1, 2, 4]);
    mesh.getColorAt(2, c);
    const base = new THREE.Color('#f7931a');
    expect(c.r).toBeCloseTo(base.r);
    expect(c.g).toBeCloseTo(base.g);
    expect(c.b).toBeCloseTo(base.b);
    mesh.getColorAt(1, c);
    const selected = new THREE.Color('#00ff88');
    expect(c.r).toBeCloseTo(selected.r);
    expect(c.g).toBeCloseTo(selected.g);
    expect(c.b).toBeCloseTo(selected.b);
  });

  it('adds no partial range while a full colour upload is still pending', () => {
    const { hook, props } = mount();
    clearSpies();
    hook.rerender({ ...props, hoveredIndex: 3 });
    expect(indicesOf(setColorAt)).toEqual([3]);
    expect(addUpdateRange).not.toHaveBeenCalled();
  });

  it('passes hover, leave, click and double-click straight to the parent with the instance id', () => {
    const { hook, props } = mount();
    const el = meshElement(hook.result.current) as MeshProps & { onClick: (e: unknown) => void; onDoubleClick: (e: unknown) => void };
    const event = (instanceId: number) => ({ instanceId, stopPropagation: jest.fn() });
    el.onPointerOver(event(3));
    expect(props.onHover).toHaveBeenLastCalledWith(props.parcels[3]);
    el.onPointerOut();
    expect(props.onHover).toHaveBeenLastCalledWith(null);
    el.onClick(event(4));
    expect(props.onClick).toHaveBeenLastCalledWith(props.parcels[4]);
    el.onDoubleClick(event(5));
    expect(props.onDoubleClick).toHaveBeenLastCalledWith(props.parcels[5]);
  });
});
