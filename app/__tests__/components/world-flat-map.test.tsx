/** @jest-environment jsdom */
/**
 * The flat map: the block from above, drawn from the chain's data only. It never fetches, never draws the seeded
 * layout (loading and mock show words instead of a canvas), fits a phone, and keeps focus on its own section.
 */
import fs from 'fs';
import path from 'path';
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FlatMap from '@/components/nexus/world/FlatMap';

const SRC = fs.readFileSync(path.join(__dirname, '../../src/components/nexus/world/FlatMap.tsx'), 'utf8');

const squares = [{ txIndex: 0, gridSize: 4 }, { txIndex: 1, gridSize: 2 }, { txIndex: 2, gridSize: 1 }];
type P = React.ComponentProps<typeof FlatMap>;
const props = (over: Partial<P> = {}): P => ({
  blockHeight: 840000, dataSource: 'real', estimated: false, squares, txCount: 3050, onRetry: jest.fn(), ...over,
});

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the flat map draws real data only', () => {
  it('real: a canvas named for the block and its parcel count', () => {
    const { container } = render(<FlatMap {...props()} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(canvas?.getAttribute('aria-label')).toBe('Flat map of block 840,000: 3,050 parcels');
  });

  it('the canvas fits a phone: its width and height are capped at the viewport minus 32 px (read from source)', () => {
    expect(SRC).toContain("width: 'min(70vh, 576px, calc(100vw - 32px))'");
    expect(SRC).toContain("height: 'min(70vh, 576px, calc(100vw - 32px))'");
  });

  it('real without a count: the label names the block only', () => {
    const { container } = render(<FlatMap {...props({ txCount: null })} />);
    expect(container.querySelector('canvas')?.getAttribute('aria-label')).toBe('Flat map of block 840,000');
  });

  it('loading: no canvas, a status line', () => {
    const { container } = render(<FlatMap {...props({ dataSource: 'loading', txCount: null })} />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Loading the block…');
  });

  it('mock: no canvas, the reason, and "Try again" asks for the data again', () => {
    const onRetry = jest.fn();
    const { container } = render(<FlatMap {...props({ dataSource: 'mock', txCount: null, onRetry })} />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByText("The block's data didn't load.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('mock turning real shows the canvas and drops "Try again"', () => {
    const { container, rerender } = render(<FlatMap {...props({ dataSource: 'mock', txCount: null })} />);
    rerender(<FlatMap {...props()} />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('the flat map caption', () => {
  const caption = (container: HTMLElement) => {
    const section = container.querySelector('[data-testid="world-flat-map"]') as HTMLElement;
    return (section.lastElementChild as HTMLElement).textContent;
  };

  it('real data: the block and its transactions', () => {
    const { container } = render(<FlatMap {...props()} />);
    expect(caption(container)).toBe('840,000.bitmap · 3,050 transactions');
  });

  it('an estimate says so', () => {
    const { container } = render(<FlatMap {...props({ estimated: true })} />);
    expect(caption(container)).toBe('840,000.bitmap · 3,050 transactions · Estimated layout');
  });

  it('mock: the block only, no count', () => {
    const { container } = render(<FlatMap {...props({ dataSource: 'mock', txCount: null })} />);
    expect(caption(container)).toBe('840,000.bitmap');
  });
});

describe('the flat map keeps focus where a visitor expects it', () => {
  it('focuses its own section on mount', () => {
    render(<FlatMap {...props()} />);
    expect(document.activeElement).toBe(screen.getByTestId('world-flat-map'));
  });

  it('with focus on "Try again", turning real leaves focus on the section', () => {
    const { rerender } = render(<FlatMap {...props({ dataSource: 'mock', txCount: null })} />);
    screen.getByRole('button', { name: 'Try again' }).focus();
    rerender(<FlatMap {...props()} />);
    expect(document.activeElement).toBe(screen.getByTestId('world-flat-map'));
  });

  it('with focus outside the section, loading turning real leaves focus there', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    const { rerender } = render(<FlatMap {...props({ dataSource: 'loading', txCount: null })} />);
    outside.focus();
    rerender(<FlatMap {...props()} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe('the flat map has no compare control and no emoji', () => {
  it.each(['real', 'loading', 'mock'] as const)('%s', (dataSource) => {
    const { container } = render(<FlatMap {...props({ dataSource })} />);
    for (const el of Array.from(container.querySelectorAll('button, a'))) expect(el.textContent ?? '').not.toMatch(/Compare/);
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
