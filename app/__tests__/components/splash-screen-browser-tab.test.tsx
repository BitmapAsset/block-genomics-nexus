/**
 * The splash overlay is for the installed app only. Its "installed?" check runs
 * in an effect, after hydration, so the server HTML used to carry a visible
 * full-screen overlay on every page: a visitor in a browser tab saw the splash
 * instead of the page until the JavaScript had run. The overlay now ships hidden
 * and only a standalone display (the installed app) shows it from the first frame.
 */
import { renderToString } from 'react-dom/server';
import SplashScreen from '@/components/pwa/SplashScreen';

function overlayClasses(html: string): string[] {
  const at = html.indexOf('z-[9999]');
  expect(at).toBeGreaterThanOrEqual(0);
  const tag = html.slice(html.lastIndexOf('<div', at), html.indexOf('>', at));
  const m = /class="([^"]*)"/.exec(tag);
  return (m ? m[1] : '').split(/\s+/).filter(Boolean);
}

describe('splash screen in a browser tab', () => {
  it('server HTML keeps the overlay for the installed app but hides it elsewhere', () => {
    const classes = overlayClasses(renderToString(<SplashScreen />));
    expect(classes).toContain('hidden');
    expect(classes).toContain('[@media(display-mode:standalone)]:flex');
    expect(classes).not.toContain('flex');
  });

  it('keeps the overlay full-screen and on top when it is shown', () => {
    const classes = overlayClasses(renderToString(<SplashScreen />));
    expect(classes).toEqual(expect.arrayContaining(['fixed', 'inset-0', 'z-[9999]']));
  });
});
