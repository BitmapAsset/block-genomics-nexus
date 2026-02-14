import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative border-t border-border" style={{ background: '#0a0a12', zIndex: 30 }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center mb-3">
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
            <a
              href="https://github.com/BitmapAsset/block-genomics-nexus"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all hover:bg-white/5 mt-2"
              style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#c8d0da' }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              GitHub
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
