'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export interface BlockTab {
  id: string;
  label: string;
  count?: number;
}

/**
 * World · Guardian · Experiences · Activity.
 *
 * Every panel is server-rendered into the HTML (crawlers and no-JS readers get
 * all of it); this only chooses which one shows. The choice lives in `?tab=`
 * so a tab can be shared, and is written with history.replaceState, which Next
 * syncs into useSearchParams without re-running the server render.
 */
export default function BlockTabs({ tabs, panels }: { tabs: BlockTab[]; panels: Record<string, React.ReactNode> }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get('tab');
  const active = tabs.some((t) => t.id === requested) ? (requested as string) : tabs[0].id;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = useCallback(
    (id: string, focus = false) => {
      const q = new URLSearchParams(params.toString());
      if (id === tabs[0].id) q.delete('tab');
      else q.set('tab', id);
      const qs = q.toString();
      window.history.replaceState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
      if (focus) refs.current[id]?.focus();
    },
    [params, pathname, tabs],
  );

  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const last = tabs.length - 1;
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? last : e.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : index === 0 ? last : index - 1;
    select(tabs[next].id, true);
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Block sections"
        className="-mx-5 flex gap-1 overflow-x-auto border-b border-white/[0.08] px-5 sm:mx-0 sm:px-0"
      >
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`relative inline-flex min-h-[48px] shrink-0 items-center gap-2 px-4 text-sm font-medium transition-colors ${
                on ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] tabular-nums text-text-primary">{t.count}</span>
              )}
              {on && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-bitcoin" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="pt-8"
        >
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
