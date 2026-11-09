/** @jest-environment jsdom */
/**
 * The keyboard rule (components/nexus/hud/keys): both world camera controllers listen on `window`, so a key typed
 * into a field, or Space / Enter on a focused button or link, must belong to the page and not move the camera. Key
 * releases are never ignored. The speed settings reach the frame through refs, so changing one never re-binds the
 * listeners; Fly's look-drag starts on the canvas only. Source checks read ParcelView.tsx with the TypeScript AST.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { controllerIgnoresKey } from '@/components/nexus/hud/keys';

const SRC = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/ParcelView.tsx'), 'utf8');
const AST = ts.createSourceFile('ParcelView.tsx', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function fn(name: string): ts.FunctionDeclaration {
  const found = AST.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!found) throw new Error(`${name} not found in ParcelView.tsx`);
  return found;
}

function localFn(owner: ts.Node, name: string): string {
  let text: string | null = null;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) text = n.initializer.getText(AST);
    if (!text) ts.forEachChild(n, visit);
  };
  visit(owner);
  if (!text) throw new Error(`${name} not found`);
  return text;
}

function frameBody(owner: ts.Node): string {
  let text = '';
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useFrame' && n.arguments[0]) text += n.arguments[0].getText(AST);
    ts.forEachChild(n, visit);
  };
  visit(owner);
  return text;
}

/** The dependency list of the effect that adds the keydown listener. */
function listenerDeps(owner: ts.Node): string {
  let deps: string | null = null;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useEffect' && n.arguments.length === 2) {
      if (n.arguments[0].getText(AST).includes("addEventListener('keydown'")) deps = n.arguments[1].getText(AST);
    }
    if (!deps) ts.forEachChild(n, visit);
  };
  visit(owner);
  if (!deps) throw new Error('keydown effect not found');
  return deps;
}

const key = (code: string, target: EventTarget | null, defaultPrevented = false) => ({ code, target, defaultPrevented });
const el = (html: string) => {
  const box = document.createElement('div');
  box.innerHTML = html;
  document.body.appendChild(box);
  return box.firstElementChild as HTMLElement;
};

describe('controllerIgnoresKey', () => {
  it.each([
    ['a range input + ArrowLeft', () => key('ArrowLeft', el('<input type="range">')), true],
    ['a textarea + KeyW', () => key('KeyW', el('<textarea></textarea>')), true],
    ['a select + ArrowDown', () => key('ArrowDown', el('<select><option>a</option></select>')), true],
    ['a contenteditable div + KeyW', () => key('KeyW', el('<div contenteditable="true">x</div>')), true],
    ['a button + Space', () => key('Space', el('<button>Walk</button>')), true],
    ['a button + Enter', () => key('Enter', el('<button>Walk</button>')), true],
    ['a button + KeyW', () => key('KeyW', el('<button>Walk</button>')), false],
    ['a link + Enter', () => key('Enter', el('<a href="/block/1">back</a>')), true],
    ['a menu item + Space', () => key('Space', el('<div role="menuitem">x</div>')), true],
    ['a plain div + ArrowUp', () => key('ArrowUp', el('<div>x</div>')), false],
    ['the window + KeyW', () => key('KeyW', window), false],
    ['no target + KeyW', () => key('KeyW', null), false],
    ['defaultPrevented', () => key('KeyW', el('<div>x</div>'), true), true],
  ])('%s → %s', (_label, make, want) => {
    expect(controllerIgnoresKey(make())).toBe(want);
  });
});

describe('the controllers follow the rule', () => {
  const fly = fn('FlyoverController');
  const walk = fn('StreetWalker');

  it.each([['FlyoverController', fly], ['StreetWalker', walk]])('%s keydown asks controllerIgnoresKey before holding a key', (_n, owner) => {
    const down = localFn(owner, 'onKeyDown');
    expect(down).toContain('controllerIgnoresKey(e)');
    expect(down.indexOf('controllerIgnoresKey(e)')).toBeLessThan(down.indexOf('keys.current.add'));
    const up = localFn(owner, 'onKeyUp');
    expect(up).toContain('keys.current.delete');
    expect(up).not.toContain('controllerIgnoresKey');
  });

  it('Fly starts a look-drag on the canvas only; mouseup stays on window', () => {
    const text = fly.getText(AST);
    expect(text).toContain('const el = gl.domElement;');
    expect(text).toContain("el.addEventListener('mousedown', onMouseDown)");
    expect(text).not.toContain("window.addEventListener('mousedown'");
    expect(text).toContain("window.addEventListener('mouseup', onMouseUp)");
  });

  it('Walk turns the camera only for a press that started on the canvas', () => {
    const move = localFn(walk, 'onMouseMove');
    expect(move).toMatch(/^\(e: MouseEvent\) => \{\s*\/\/[^\n]*\n\s*if \(!pressOnCanvas\.current\) return;/);
    expect(localFn(walk, 'onMouseDown')).toContain('pressOnCanvas.current = true');
  });

  it('Fly reads tourKmh / cruiseKmh through refs; its frame no longer reads the speed constants', () => {
    const body = frameBody(fly);
    expect(body).toContain('tourKmhRef.current');
    expect(body).toContain('cruiseKmhRef.current');
    for (const c of ['AUTO_TOUR_SPEED', 'FLY_SPEED', 'FLY_BOOST_SPEED']) expect(body).not.toMatch(new RegExp(`\\b${c}\\b`));
    const deps = listenerDeps(fly);
    for (const d of ['tourKmh', 'cruiseKmh', 'autoTour']) expect(deps).not.toMatch(new RegExp(`\\b${d}\\b`));
  });

  it('Walk reads runLocked through a ref, never as a listener dependency', () => {
    expect(frameBody(walk)).toContain('runLockedRef.current ||');
    expect(listenerDeps(walk)).not.toMatch(/\brunLocked\b/);
  });

  it('ParcelView hands the controllers a stable onExitAutoTour', () => {
    expect(SRC).toMatch(/const exitAutoTour = useCallback\(\(\) => setAutoTour\(false\), \[\]\);/);
    expect(SRC).toContain('onExitAutoTour={exitAutoTour}');
    expect(SRC).not.toContain('onExitAutoTour={() =>');
  });
});
