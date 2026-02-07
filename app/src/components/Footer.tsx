import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-primary/50">
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
            <p className="text-xs text-text-muted leading-relaxed">
              Decentralized Bitcoin block verification through cryptographic
              genome extraction and trust-scored agents.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
              Platform
            </h3>
            <ul className="space-y-2">
              {[
                { href: "/explore", label: "Explorer" },
                { href: "/verify", label: "Verify" },
                { href: "/leaderboard", label: "Leaderboard" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-muted hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
              Developers
            </h3>
            <ul className="space-y-2">
              {[
                { href: "/docs", label: "Documentation" },
                { href: "/api", label: "API Reference" },
                { href: "https://github.com", label: "GitHub" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-muted hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Network */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
              Network
            </h3>
            <div className="glass-panel p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Status</span>
                <span className="flex items-center gap-1.5 text-xs text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Agents</span>
                <span className="text-xs text-text-secondary">—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Blocks Verified</span>
                <span className="text-xs text-text-secondary">—</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-muted">
            © {new Date().getFullYear()} Block Genomics. Built on Bitcoin.
          </p>
          <p className="text-xs text-text-muted">
            Securing the blockchain, one block at a time.
          </p>
        </div>
      </div>
    </footer>
  );
}
