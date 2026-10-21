/**
 * @jest-environment jsdom
 */

/**
 * The footer counters ("Agents", "Blocks Verified") read "—" to every
 * reader without JavaScript (crawlers, LLM fetchers, the 2026-10-20 outside
 * audit): the numbers were fetched client-side only, so the server HTML always
 * shipped the placeholder. In a real browser they filled in (9 / 17, probed
 * headless on production). The root layout now reads the same stats as
 * /api/v1/stats on the server and hands them to both footers, so the first
 * HTML already carries the numbers. The landing footer's markup is frozen:
 * only its data path changed, which the last test pins.
 */

import { renderToString } from 'react-dom/server';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));
jest.mock('next/link', () => {
  const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  );
  return { __esModule: true, default: Link };
});

import Footer from '@/components/Footer';
import LandingFooter from '@/components/landing/LandingFooter';

const STATS = { verifiedAgents: 9, blocksVerified: 17, genomesMinted: 8 };

function counters(html: string) {
  const text = html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '|');
  return {
    agents: /\|Agents\|+([^|]+)\|/.exec(text)?.[1],
    blocks: /Blocks Verified\|+([^|]+)\|/.exec(text)?.[1],
  };
}

describe('footer counters in the server HTML', () => {
  it('site footer renders the real numbers when the layout passes them', () => {
    expect(counters(renderToString(<Footer initialStats={STATS} />))).toEqual({ agents: '9', blocks: '17' });
  });

  it('landing footer renders the real numbers when the layout passes them', () => {
    expect(counters(renderToString(<LandingFooter initialStats={STATS} />))).toEqual({ agents: '9', blocks: '17' });
  });

  it('still renders the placeholder when the server could not read stats', () => {
    expect(counters(renderToString(<LandingFooter initialStats={null} />))).toEqual({ agents: '—', blocks: '—' });
  });

  it('landing footer markup is unchanged apart from the two numbers', () => {
    const withStats = renderToString(<LandingFooter initialStats={STATS} />);
    const without = renderToString(<LandingFooter />);
    const normalise = (h: string) =>
      h.replace(/<!--.*?-->/g, '').replace(/(>Agents<\/span><span[^>]*>)[^<]*/, '$1#').replace(/(Blocks Verified<\/span><span[^>]*>)[^<]*/, '$1#');
    expect(normalise(withStats)).toBe(normalise(without));
  });
});
