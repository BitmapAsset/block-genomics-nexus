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
const names = new Set(['GridLines', 'ParcelTextureOverlay', 'generatePatternTexture', 'EstateShape', 'ViewerMemoryWatchdog', 'GroundPlane']);
const renderer = {info: {memory: {geometries: 10, textures: 2}}};
const bodies = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.has(d.name.text)))
).map(node => node.getText(ast)).join('\n');
const js = ts.transpileModule(bodies, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
const components = new Function('React', 'THREE', 'renderer', `
const {useMemo, useEffect, useState, useRef, useCallback} = React;
const memo = fn => fn;
const BLOCK_SIZE = 20;
const useThree = () => ({gl: renderer});
const Html = 'div';
const estateOwnerLabel = () => 'Owner';
${js}
return {GridLines, ParcelTextureOverlay, EstateShape, ViewerMemoryWatchdog, GroundPlane};
`)(React, THREE, renderer) as {
  GroundPlane: (props: {viewMode: string}) => React.ReactElement;
  EstateShape: (props: Record<string, unknown>) => React.ReactElement;
  ViewerMemoryWatchdog: (props: {placementRevision: string}) => null;
  GridLines: () => React.ReactElement;
  ParcelTextureOverlay: (props: {parcels: unknown[]; customizations: Map<number, unknown>; viewMode: string}) => React.ReactElement;
};

afterEach(() => jest.restoreAllMocks());

it('releases the ground shader when changing street mode and on unmount', () => {
  const dispose = jest.spyOn(THREE.Material.prototype, 'dispose');
  const {rerender, unmount} = renderHook(props => components.GroundPlane(props), {initialProps: {viewMode: 'flat'}});
  rerender({viewMode: 'street'});
  expect(dispose).toHaveBeenCalledTimes(1);
  unmount();
  expect(dispose).toHaveBeenCalledTimes(2);
});

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

it('keeps estate outlines stable across hover and proximity changes, releasing each old shape', () => {
  const props = {estate: {id: 'estate', parcelIndices: [0], glowColor: '#f7931a', name: 'Estate'},
    parcels: [{x: 0, z: 0, width: 2, depth: 2, buildHeight: 1}], isHovered: false, isClose: false,
    onHoverEstate: jest.fn(), onClickEstate: jest.fn()};
  const geometries = (element: React.ReactElement): THREE.BufferGeometry[] => {
    const found: THREE.BufferGeometry[] = [];
    function visit(node: React.ReactNode) {
      React.Children.forEach(node, child => {
        if (!React.isValidElement<{geometry?: THREE.BufferGeometry; children?: React.ReactNode}>(child)) return;
        if (child.props.geometry) found.push(child.props.geometry);
        visit(child.props.children);
      });
    }
    visit(element);
    return found;
  };
  const {result, rerender, unmount} = renderHook(p => components.EstateShape(p), {initialProps: props});
  const first = geometries(result.current);
  expect(first).toHaveLength(2);
  const released = first.map(geometry => jest.spyOn(geometry, 'dispose'));
  for (let i = 0; i < 50; i++) {
    rerender({...props, isHovered: i % 2 === 0, isClose: i % 3 === 0});
    expect(geometries(result.current)).toEqual(first);
  }
  rerender({...props, parcels: [{...props.parcels[0], width: 3}]});
  released.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  const lastReleased = geometries(result.current).map(geometry => jest.spyOn(geometry, 'dispose'));
  unmount();
  lastReleased.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
});

it('warns after 30 seconds of idle GPU growth, resets for placements, and stops on unmount', () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const {rerender, unmount} = renderHook(props => components.ViewerMemoryWatchdog(props), {initialProps: {placementRevision: 'a'}});
  const grow = (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      renderer.info.memory.geometries++;
      jest.advanceTimersByTime(1000);
    }
  };
  grow(29);
  expect(warn).not.toHaveBeenCalled();
  rerender({placementRevision: 'b'});
  grow(29);
  expect(warn).not.toHaveBeenCalled();
  grow(1);
  expect(warn).toHaveBeenCalledTimes(1);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
