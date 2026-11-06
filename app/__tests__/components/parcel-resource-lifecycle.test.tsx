/** @jest-environment jsdom */
/**
 * There is no R3F test renderer in this repo. Exercise the actual component
 * bodies with React's hook lifecycle and real Three resources, without a GPU.
 * AST extraction avoids importing the viewer's wallet/network/UI dependencies.
 * The browser gate separately proves R3F upload counts and rendered frames.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import * as React from 'react';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';

const source = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');
const ast = ts.createSourceFile('ParcelView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['GridLines', 'ParcelTextureOverlay', 'generatePatternTexture']);
const bodies = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.has(d.name.text)))
).map(node => node.getText(ast)).join('\n');
const js = ts.transpileModule(bodies, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
const components = new Function('React', 'THREE', `
const {useMemo, useEffect, useState, useRef, useCallback} = React;
const memo = fn => fn;
const BLOCK_SIZE = 20;
${js}
return {GridLines, ParcelTextureOverlay};
`)(React, THREE) as {
  GridLines: () => React.ReactElement;
  ParcelTextureOverlay: (props: {parcels: unknown[]; customizations: Map<number, unknown>; viewMode: string}) => React.ReactElement;
};

afterEach(() => jest.restoreAllMocks());

it('keeps grid GPU geometry stable for 100 parent renders and disposes it on unmount', () => {
  const made: THREE.BufferGeometry[] = [];
  const original = THREE.BufferGeometry.prototype.setFromPoints;
  jest.spyOn(THREE.BufferGeometry.prototype, 'setFromPoints').mockImplementation(function (this: THREE.BufferGeometry, points) {
    made.push(this);
    return original.call(this, points);
  });
  const { rerender, unmount } = renderHook(() => components.GridLines());
  const initial = made.length;
  expect(initial).toBeGreaterThan(0);
  const disposed = made.map(geometry => jest.spyOn(geometry, 'dispose'));
  for (let i = 0; i < 100; i++) rerender();
  expect(made).toHaveLength(initial);
  unmount();
  disposed.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
});

it('reuses a pattern key across renders and releases removed/unmounted textures', () => {
  const ctx = new Proxy({}, {get: () => jest.fn(), set: () => true});
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
  const dispose = jest.spyOn(THREE.Texture.prototype, 'dispose');
  const parcel = {txIndex: 0, x: 0, z: 0, width: 1, depth: 1, buildHeight: 1};
  const props = {parcels: [parcel], customizations: new Map([[0, {pattern: 'stripes', color: '#f7931a'}]]), viewMode: 'flat'};
  const maps = (element: React.ReactElement): THREE.Texture[] => {
    const found: THREE.Texture[] = [];
    function visit(node: React.ReactNode) {
      React.Children.forEach(node, child => {
        if (!React.isValidElement<{map?: THREE.Texture; children?: React.ReactNode}>(child)) return;
        if (child.props.map) found.push(child.props.map);
        visit(child.props.children);
      });
    }
    visit(element);
    return found;
  };
  const {result, rerender, unmount} = renderHook(p => components.ParcelTextureOverlay(p), {initialProps: props});
  const first = maps(result.current)[0];
  expect(first).toBeInstanceOf(THREE.Texture);
  for (let i = 0; i < 25; i++) {
    rerender({...props, customizations: new Map(props.customizations)});
    expect(maps(result.current)[0]).toBe(first);
  }
  rerender({...props, customizations: new Map([[0, {pattern: 'stripes', color: '#00ff88'}]])});
  const second = maps(result.current)[0];
  expect(second).not.toBe(first);
  expect(dispose.mock.instances).toContain(first);
  unmount();
  expect(dispose.mock.instances).toContain(second);
});
