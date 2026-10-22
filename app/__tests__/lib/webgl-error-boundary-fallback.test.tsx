/**
 * @jest-environment jsdom
 */

/**
 * QA scorecard 2026-10-22 row #8: without WebGL, the landing background's
 * boundary drew its "3D rendering unavailable / Try again" card on top of the
 * hero copy. The landing now passes `fallback={null}` (a silent failure for a
 * decorative scene); every other call site keeps the card.
 */

import { render } from '@testing-library/react';
import WebGLErrorBoundary from '@/components/WebGLErrorBoundary';

function Broken(): never {
  throw new Error('WebGL context lost');
}

describe('WebGLErrorBoundary fallback', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('renders nothing when fallback is null', () => {
    const { container } = render(
      <WebGLErrorBoundary fallback={null}>
        <Broken />
      </WebGLErrorBoundary>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('keeps the card when no fallback is given', () => {
    const { container } = render(
      <WebGLErrorBoundary>
        <Broken />
      </WebGLErrorBoundary>,
    );
    expect(container.textContent).toContain('3D rendering unavailable');
    expect(container.textContent).toContain('Try again');
  });
});
