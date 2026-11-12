/** @jest-environment jsdom */
/**
 * The second net around the 3D scene: an error thrown while the scene renders hands the view over once and leaves
 * nothing behind; a scene that renders passes through untouched.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import SceneBoundary from '@/components/nexus/world/SceneBoundary';

function Throws(): React.ReactElement {
  throw new Error('scene failed');
}

describe('SceneBoundary', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('a scene that throws while rendering calls onFail once and renders nothing', () => {
    const onFail = jest.fn();
    const { container } = render(
      <SceneBoundary onFail={onFail}>
        <Throws />
      </SceneBoundary>,
    );
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('');
  });

  it('a scene that renders shows its content and does not call onFail', () => {
    const onFail = jest.fn();
    render(
      <SceneBoundary onFail={onFail}>
        <p>the scene</p>
      </SceneBoundary>,
    );
    expect(screen.getByText('the scene')).toBeTruthy();
    expect(onFail).not.toHaveBeenCalled();
  });
});
