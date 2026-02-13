import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border" style={{ background: '#0a0a12' }}>
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
            <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
              Decentralized Bitcoin block verification through cryptographic
              genome extraction and trust-scored agents.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#cbd5e1' }}>
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
                    style={{ color: '#94a3b8' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#cbd5e1' }}>
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
                    style={{ color: '#94a3b8' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Network */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#cbd5e1' }}>
              Network
            </h3>
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Status</span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4ade80' }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Agents</span>
                <span className="text-xs" style={{ color: '#cbd5e1' }}>—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#94a3b8' }}>Blocks Verified</span>
                <span className="text-xs" style={{ color: '#cbd5e1' }}>—</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            © {new Date().getFullYear()} Block Genomics. Built on Bitcoin.
          </p>
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            Securing the blockchain, one block at a time.
          </p>
        </div>
      </div>
    </footer>
  );
}
