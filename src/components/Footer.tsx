import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative border-t border-border" style={{ background: '#0a0a12', zIndex: 30 }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-cyan/10 border border-accent-cyan/20">
                <span className="text-accent-cyan font-bold text-xs">BG</span>
              </div>
              <span className="text-sm font-semibold text-gradient-cyan-purple">
                Block Genomics
              </span>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: '#c8d0da' }}>
              Decentralized Bitcoin block verification through cryptographic
              genome extraction and trust-scored agents.
            </p>
            <a
              href="https://x.com/BlockGenomics"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#c8d0da' }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              @BlockGenomics
            </a>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#e2e8f0' }}>
              Platform
            </h3>
            <ul className="space-y-2">
              {[
                { href: "/nexus", label: "Nexus" },
                { href: "/directory", label: "Agent Directory" },
                { href: "/verify", label: "Verify" },
                { href: "/whitepaper", label: "White Paper" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: '#c8d0da' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#e2e8f0' }}>
              Developers
            </h3>
            <ul className="space-y-2">
              {[
                { href: "/whitepaper", label: "Documentation" },
                { href: "/api/v1/blocks/1", label: "API Reference" },
                { href: "https://github.com", label: "GitHub" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: '#c8d0da' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Network */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#e2e8f0' }}>
              Network
            </h3>
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#c8d0da' }}>Status</span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4ade80' }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#c8d0da' }}>Agents</span>
                <span className="text-xs" style={{ color: '#e2e8f0' }}>—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#c8d0da' }}>Blocks Verified</span>
                <span className="text-xs" style={{ color: '#e2e8f0' }}>—</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs" style={{ color: '#c8d0da' }}>
            © {new Date().getFullYear()} Block Genomics. Built on Bitcoin.
          </p>
          <p className="text-xs italic" style={{ color: '#c8d0da' }}>
            Every block tells a story. We gave it a voice.
          </p>
          <p className="text-[10px] tracking-wide" style={{ color: '#94a3b8' }}>
            Built by a human and an AI — on the chain that changed everything.
          </p>
        </div>
      </div>
    </footer>
  );
}
