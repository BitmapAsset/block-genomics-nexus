/**
 * @jest-environment jsdom
 */

/**
 * QA 2026-10-22 #23: no page linked to the film. The site footer (every page
 * except the landing, which keeps its own) carries a YouTube link beside X.
 */

import { render } from '@testing-library/react';

jest.mock('@/hooks/useStats', () => ({ useStats: () => null }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import Footer from '@/components/Footer';

it('links the film on YouTube next to X, in a new tab', () => {
  const { container } = render(<Footer />);
  const yt = container.querySelector('a[href="https://www.youtube.com/watch?v=PJ_quZRoO7w"]') as HTMLAnchorElement;
  expect(yt).not.toBeNull();
  expect(yt.target).toBe('_blank');
  expect(yt.rel).toContain('noopener');
  const x = container.querySelector('a[href="https://x.com/BlockGenomics"]');
  expect(x?.nextElementSibling).toBe(yt);
});
