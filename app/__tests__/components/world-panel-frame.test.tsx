/** @jest-environment jsdom */
/**
 * The block panel's frame, pressed: an open panel is the side column from md up and the bottom sheet below it, the hide
 * button hides it, the width buttons and the tabs do what they say, and below md the hide button shares the tab row.
 * The view (ParcelView) keeps the state and wires these two modules as the harness component below does.
 */
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PanelBar from '@/components/nexus/world/PanelBar';
import { panelRootClass, type PanelSize, type RightTab } from '@/components/nexus/world/panel-frame';

const TABS = [{ key: 'properties' as RightTab, label: 'PROPERTIES' }, { key: 'chat' as RightTab, label: 'CHAT' }];
const OPEN: PanelSize[] = ['compact', 'quarter', 'third', 'half'];
const SHEET = ['max-md:absolute', 'max-md:inset-x-0', 'max-md:bottom-[calc(72px+env(safe-area-inset-bottom))]',
  'max-md:z-30', 'max-md:!w-full', 'max-md:h-[calc(45vh-72px)]', 'max-md:landscape:min-h-[min(224px,calc(100%-136px))]',
  'max-md:rounded-t-2xl', 'max-md:border-t', 'max-md:border-line-2'];
function Panel({ initial }: { initial: PanelSize }) {
  const [size, setSize] = React.useState<PanelSize>(initial);
  const [tab, setTab] = React.useState<RightTab>('properties');
  const hide = React.useRef<HTMLButtonElement>(null);
  return (
    <div data-testid="root" data-size={size} className={panelRootClass(size)}>
      <PanelBar size={size} onSize={setSize} hideRef={hide} tabs={TABS} tab={tab} onTab={setTab} />
    </div>
  );
}
const classes = () => screen.getByTestId('root').className.split(/\s+/);
const split = (el: Element) => (el.getAttribute('class') || '').split(/\s+/);
const noop = () => undefined;

describe("the block panel's frame", () => {
  it('an open panel is the sheet below md and never hidden there; a hidden one leaves the flow below md', () => {
    const widths: Record<string, string> = { compact: 'w-80', quarter: 'w-96', third: 'w-[33vw]', half: 'w-[50vw]' };
    for (const s of OPEN) {
      const c = panelRootClass(s).split(' ');
      for (const k of [...SHEET, 'md:border-l', 'md:border-line-2', 'bp-dark', 'bg-bg-primary', 'flex-shrink-0', 'flex',
        'flex-col', 'overflow-hidden', 'transition-all', 'duration-300', 'motion-reduce:transition-none', widths[s]]) {
        expect(c).toContain(k);
      }
      for (const k of ['max-md:hidden', 'max-md:bottom-0', 'max-md:h-[45vh]']) expect(c).not.toContain(k);
      expect(c.some((k) => k.includes('100dvh'))).toBe(false);
    }
    const h = panelRootClass('hidden').split(' ');
    for (const k of ['max-md:hidden', 'w-0', 'bp-dark', 'flex-shrink-0', 'motion-reduce:transition-none']) expect(h).toContain(k);
    for (const k of ['max-md:absolute', 'md:border-l']) expect(h).not.toContain(k);
  });

  it('the hide button hides the panel, and the tab and the widths reopen and size it', () => {
    render(<Panel initial="quarter" />);
    expect(classes()).toContain('w-96');
    expect(classes()).toContain('max-md:absolute');
    fireEvent.click(screen.getByRole('button', { name: 'Hide block panel' }));
    expect(screen.getByTestId('root').dataset.size).toBe('hidden');
    expect(classes()).toContain('w-0');
    expect(classes()).toContain('max-md:hidden');
    expect(classes()).not.toContain('max-md:absolute');
    fireEvent.click(screen.getByRole('button', { name: 'XL' }));
    expect(screen.getByTestId('root').dataset.size).toBe('half');
    expect(classes()).toContain('w-[50vw]');
    expect(screen.getByRole('button', { name: 'XL' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'M' }).getAttribute('aria-pressed')).toBe('false');
    for (const [label, size] of [['S', 'compact'], ['L', 'third'], ['M', 'quarter']]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByTestId('root').dataset.size).toBe(size);
    }
  });

  it('the widths are a named group of four lettered buttons, each with its plain title', () => {
    render(<Panel initial="quarter" />);
    const group = screen.getByRole('group', { name: 'Panel width' });
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['S', 'M', 'L', 'XL']);
    expect(buttons.map((b) => b.getAttribute('title'))).toEqual(['Narrow', 'Default', 'One third', 'Half']);
    for (const b of buttons) {
      expect(b.hasAttribute('aria-label')).toBe(false);
      for (const k of ['min-h-[44px]', 'min-w-[44px]', 'focus-visible:outline-2']) expect(split(b)).toContain(k);
    }
    const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(split(pressed[0])).toContain('bg-surface-3');
    expect(split(group)).toContain('hidden');
    expect(split(group)).toContain('md:flex');
  });

  it('the hide button is 44 px, ringed, an icon with a label, and the ref the view focuses', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<PanelBar size="quarter" onSize={noop} hideRef={ref} tabs={TABS} tab="properties" onTab={noop} />);
    const hide = screen.getByRole('button', { name: 'Hide block panel' });
    expect(ref.current).toBe(hide);
    expect(hide.getAttribute('title')).toBe('Hide panel');
    for (const k of ['min-h-[44px]', 'min-w-[44px]', 'focus-visible:outline-2', 'order-2', 'mr-2']) expect(split(hide)).toContain(k);
    expect(hide.textContent).toBe('');
    const svgs = hide.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    expect(svgs[0].getAttribute('width')).toBe('18');
  });

  it('the tabs press, say which is shown, and sit left of the hide button below md', () => {
    const { container } = render(<Panel initial="quarter" />);
    fireEvent.click(screen.getByRole('button', { name: 'CHAT' }));
    const chat = screen.getByRole('button', { name: 'CHAT' });
    const props = screen.getByRole('button', { name: 'PROPERTIES' });
    expect(chat.getAttribute('aria-pressed')).toBe('true');
    expect(split(chat)).toContain('border-text-1');
    expect(split(chat)).toContain('text-text-1');
    expect(props.getAttribute('aria-pressed')).toBe('false');
    expect(split(props)).toContain('border-transparent');
    for (const b of [chat, props]) {
      expect(split(b)).toContain('min-h-[44px]');
      expect(split(b)).toContain('focus-visible:outline-2');
    }
    const bar = container.querySelector('[data-world-panel-head]') as HTMLElement;
    expect(bar).not.toBeNull();
    for (const k of ['flex-wrap', 'border-b', 'border-line-2', 'max-md:pt-1']) expect(split(bar)).toContain(k);
    const kids = Array.from(bar.children);
    const group = screen.getByRole('group', { name: 'Panel width' });
    const hide = screen.getByRole('button', { name: 'Hide block panel' });
    const tabs = bar.querySelector('[data-world-panel-tabs]') as HTMLElement;
    expect(tabs).not.toBeNull();
    expect(kids).toEqual([group, hide, tabs]);
    for (const k of ['order-1', 'flex-1', 'min-w-0', 'md:order-3', 'md:basis-full', 'md:border-t']) expect(split(tabs)).toContain(k);
    for (const k of ['md:order-1', 'md:flex-1', 'md:pl-2', 'md:py-1.5']) expect(split(group)).toContain(k);
    expect(split(group)).not.toContain('md:px-2');
    for (const el of [bar, ...Array.from(bar.querySelectorAll('*'))]) expect(el.hasAttribute('style')).toBe(false);
  });
});
