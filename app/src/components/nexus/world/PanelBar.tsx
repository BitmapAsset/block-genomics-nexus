'use client';

import type { Ref } from 'react';
import { X } from 'lucide-react';
import type { PanelSize, RightTab } from './panel-frame';

const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan';

const SIZES: { size: PanelSize; label: string; name: string }[] = [
  { size: 'compact', label: 'S', name: 'Narrow' },
  { size: 'quarter', label: 'M', name: 'Default' },
  { size: 'third', label: 'L', name: 'One third' },
  { size: 'half', label: 'XL', name: 'Half' },
];

interface Props {
  size: PanelSize;
  onSize: (size: PanelSize) => void;
  hideRef: Ref<HTMLButtonElement>;
  tabs: { key: RightTab; label: string }[];
  tab: RightTab;
  onTab: (key: RightTab) => void;
}

/**
 * The block panel's top: the width buttons (from md up), the hide button and the tabs. From md up they sit in two rows
 * as before (widths and hide, then the tabs); below md the width buttons are not shown and the hide button joins the tab
 * row, so the sheet gives that row's height to the facts.
 */
export default function PanelBar({ size, onSize, hideRef, tabs, tab, onTab }: Props) {
  return (
    <div data-world-panel-head className="flex flex-wrap items-center border-b border-line-2 max-md:pt-1">
      <div role="group" aria-label="Panel width" className="hidden gap-1 md:order-1 md:flex md:flex-1 md:py-1.5 md:pl-2">
        {SIZES.map(s => (
          <button key={s.size} type="button" onClick={() => onSize(s.size)} title={s.name}
            aria-pressed={size === s.size}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border font-mono text-[11px] font-bold ${size === s.size ? 'border-line-2 bg-surface-3 text-text-1' : 'border-transparent text-text-3 hover:text-text-1'} ${ring}`}>
            {s.label}
          </button>
        ))}
      </div>
      <button type="button" ref={hideRef} onClick={() => onSize('hidden')} title="Hide panel" aria-label="Hide block panel"
        className={`order-2 mr-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-line-2 text-text-2 hover:text-text-1 ${ring}`}>
        <X size={18} aria-hidden="true" />
      </button>
      <div data-world-panel-tabs className="order-1 flex min-w-0 flex-1 md:order-3 md:basis-full md:border-t md:border-line-2">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => onTab(t.key)} aria-pressed={tab === t.key}
            className={`min-h-[44px] flex-1 border-b-2 px-3 text-xs font-bold tracking-wider ${tab === t.key ? 'border-text-1 text-text-1' : 'border-transparent text-text-3 hover:text-text-2'} ${ring}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
