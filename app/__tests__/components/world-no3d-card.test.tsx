/** @jest-environment jsdom */
/**
 * A browser without 3D gets a card, not a broken scene: it says so in plain words, offers the flat map as its one
 * orange action and the block page as the other, takes focus only from <body>, and is not a dialog.
 */
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import No3dCard from '@/components/nexus/world/No3dCard';

const base = { blockHeight: 840000, onFlatMap: jest.fn() };

describe('the no-3D card', () => {
  it('names the phone on phones and the browser elsewhere', () => {
    const { unmount } = render(<No3dCard {...base} phone />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe("This phone can't show the 3D block");
    unmount();
    render(<No3dCard {...base} phone={false} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe("This browser can't show the 3D block");
  });

  it('is a labelled section, not a dialog', () => {
    render(<No3dCard {...base} phone />);
    const section = screen.getByTestId('world-no3d');
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(section.tagName).toBe('SECTION');
    expect(section.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(section.hasAttribute('role')).toBe(false);
    expect(section.hasAttribute('aria-modal')).toBe(false);
  });

  it('"Open the flat map" is the primary action, focused on mount, described by the text, and opens the map', () => {
    const onFlatMap = jest.fn();
    render(<No3dCard blockHeight={840000} phone onFlatMap={onFlatMap} />);
    const primary = screen.getByRole('button', { name: 'Open the flat map' });
    expect(primary.hasAttribute('data-primary')).toBe(true);
    expect(document.activeElement).toBe(primary);
    const text = document.getElementById(primary.getAttribute('aria-describedby') ?? '');
    expect(text?.tagName).toBe('P');
    expect(text?.textContent).toBe('The flat map shows every parcel of the block from above.');
    fireEvent.click(primary);
    expect(onFlatMap).toHaveBeenCalledTimes(1);
  });

  it('"Back to the block page" links to the block', () => {
    render(<No3dCard {...base} phone />);
    expect(screen.getByRole('link', { name: 'Back to the block page' }).getAttribute('href')).toBe('/block/840000');
  });

  it('both controls are full width and at least 44 px tall', () => {
    render(<No3dCard {...base} phone />);
    for (const el of [screen.getByRole('button', { name: 'Open the flat map' }), screen.getByRole('link', { name: 'Back to the block page' })]) {
      expect(el.className).toMatch(/min-h-\[(44|48|52)px\]/);
      expect(el.className.split(/\s+/)).toContain('w-full');
    }
  });

  it('leaves focus where it is when something else holds it', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    outside.focus();
    render(<No3dCard {...base} phone />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('carries no emoji', () => {
    const { container } = render(<No3dCard {...base} phone />);
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
