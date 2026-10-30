import Link from 'next/link';
import { docPage, neighbours, siblings, type DocSlug } from './doc-pages';

/** Presentational pieces shared by the docs hub and the one-topic docs pages. */

export const linkStyle = { color: 'var(--color-accent-cyan)' } as const;

export function Section({ id, eyebrow, title, children }: { id?: string; eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: '6rem' }} className="mb-14">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>
          {eyebrow}
        </p>
      )}
      <h2 className="mb-4 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
      {children}
    </p>
  );
}

export function Badge({ children, color }: { children: React.ReactNode; color: 'cyan' | 'bitcoin' | 'purple' }) {
  const map = {
    cyan: { bg: 'rgba(102,204,255,0.1)', bd: 'rgba(102,204,255,0.3)', fg: '#66ccff' },
    bitcoin: { bg: 'rgba(247,147,26,0.08)', bd: 'rgba(247,147,26,0.25)', fg: '#f7931a' },
    purple: { bg: 'rgba(168,85,247,0.1)', bd: 'rgba(168,85,247,0.3)', fg: '#c9a5f7' },
  }[color];
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold" style={{ background: map.bg, border: `1px solid ${map.bd}`, color: map.fg }}>
      {children}
    </span>
  );
}

export function ConceptCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)' }}>
      <h3 className="mb-1.5 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{children}</p>
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</th>;
}

export function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

export function methodColor(m: string): string {
  return m === 'GET' ? '#66ccff' : m === 'POST' ? '#4ade80' : m === 'DELETE' ? '#ff6b6b' : '#f7931a';
}

export function RefTable({ rows, left, right }: { rows: [string, string][]; left: string; right: string }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(102,204,255,0.06)' }}>
            <Th>{left}</Th><Th>{right}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, r]) => (
            <tr key={l} style={{ borderTop: '1px solid var(--color-border)' }}>
              <Td><code className="doc-inline-code">{l}</code></Td>
              <Td><span style={{ color: 'var(--color-text-secondary)' }}>{r}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResourceLink({ href, title, desc, internal }: { href: string; title: string; desc: string; internal?: boolean }) {
  const inner = (
    <>
      <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title} →</div>
      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc}</div>
    </>
  );
  const cls = 'block rounded-xl p-4 transition-all hover:bg-white/5';
  const style = { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)' } as const;
  return internal ? (
    <Link href={href} className={cls} style={style}>{inner}</Link>
  ) : (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={cls} style={style}>{inner}</a>
  );
}

/**
 * Frame for a one-topic docs page: breadcrumb back to the hub, one `<h1>`,
 * the body, a Related block (hub + two siblings) and prev/next.
 */
export function DocPage({ slug, eyebrow, h1, lead, children }: { slug: DocSlug; eyebrow: string; h1: string; lead: React.ReactNode; children: React.ReactNode }) {
  const { prev, next } = neighbours(slug);
  const rel = siblings(slug);
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <Link href="/docs" style={linkStyle}>Docs</Link> <span aria-hidden="true">/</span> <span>{docPage(slug).label}</span>
      </nav>
      <header className="mb-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent-purple)' }}>{eyebrow}</p>
        <h1 className="mb-4 text-3xl font-black tracking-tight sm:text-4xl" style={{ color: 'var(--color-text-primary)' }}>{h1}</h1>
        <div className="max-w-2xl text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{lead}</div>
      </header>

      {children}

      <section aria-labelledby="related-heading" className="mb-10">
        <h2 id="related-heading" className="mb-3 text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Related</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <ResourceLink href="/docs" title="Docs home" desc="All guides, references and the FAQ." internal />
          {rel.map((p) => (
            <ResourceLink key={p.slug} href={`/docs/${p.slug}`} title={p.label} desc={p.summary} internal />
          ))}
        </div>
      </section>

      <nav aria-label="Docs pages" className="flex flex-wrap items-stretch justify-between gap-3">
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="block min-w-[12rem] flex-1 rounded-xl p-4 hover:bg-white/5" style={{ border: '1px solid var(--color-border)' }}>
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>← Previous</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{prev.label}</div>
          </Link>
        ) : (
          <Link href="/docs" className="block min-w-[12rem] flex-1 rounded-xl p-4 hover:bg-white/5" style={{ border: '1px solid var(--color-border)' }}>
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>← Back to</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Docs home</div>
          </Link>
        )}
        {next ? (
          <Link href={`/docs/${next.slug}`} className="block min-w-[12rem] flex-1 rounded-xl p-4 text-right hover:bg-white/5" style={{ border: '1px solid var(--color-border)' }}>
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Next →</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{next.label}</div>
          </Link>
        ) : (
          <Link href="/docs" className="block min-w-[12rem] flex-1 rounded-xl p-4 text-right hover:bg-white/5" style={{ border: '1px solid var(--color-border)' }}>
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Back to →</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Docs home</div>
          </Link>
        )}
      </nav>
    </div>
  );
}
