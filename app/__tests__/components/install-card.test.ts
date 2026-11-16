/**
 * The site's install card stays off an open world view: the view's root says it is there (data-world-view), the card
 * carries data-install-card, and one plain rule in globals.css hides the card while the page holds a world view. Nothing
 * else decides the card (its visit count, its dismissal and its timer stay), so leaving the view shows it again.
 */
import fs from 'fs';
import path from 'path';

const IP = fs.readFileSync(path.join(__dirname, '../../src/components/pwa/InstallPrompt.tsx'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../../src/app/globals.css'), 'utf8');

describe('the install card', () => {
  it('the install card hides while a world view is open', () => {
    expect(IP).toContain(
      '<div data-install-card className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md md:bottom-6 md:left-auto md:right-6">',
    );
    expect(CSS).toMatch(/body:has\(\[data-world-view\]\) \[data-install-card\] \{\s*display: none;\s*\}/);
  });

  it('nothing else decides the card', () => {
    expect(IP).toContain('if (getVisitCount() < 2) return;');
    expect(IP).toContain('if (isInstallDismissed()) return;');
    expect(IP.split('setTimeout(() => setVisible(true), 2000)').length).toBe(3);
    expect(IP).not.toContain('usePathname');
  });
});
