/**
 * @jest-environment jsdom
 */

/**
 * QA 2026-10-22 #14: /brain scrolled itself down to the chat on load. The chat
 * opens with a greeting, so "has messages" was already true on mount. It must
 * scroll only after the visitor has sent something.
 */

import { act, fireEvent, render } from '@testing-library/react';
import BrainChat from '@/components/BrainChat';

describe('BrainChat auto-scroll', () => {
  let scrollSpy: jest.Mock;
  beforeEach(() => {
    scrollSpy = jest.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    localStorage.clear();
  });

  it('does not scroll the page on mount', () => {
    render(<BrainChat />);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('scrolls once the visitor sends a question', () => {
    jest.useFakeTimers();
    const { container } = render(<BrainChat />);
    const input = container.querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'What is your purpose?' } });
    const form = input.closest('form');
    act(() => {
      if (form) fireEvent.submit(form);
      else fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
    expect(scrollSpy).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
