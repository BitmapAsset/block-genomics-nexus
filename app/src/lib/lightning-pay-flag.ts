/**
 * Lightning "Pay" / "Zap" UI switch — OFF unless NEXT_PUBLIC_LIGHTNING_PAY_ENABLED
 * is exactly "true" at build time.
 *
 * Paying today buys nothing: the /rentals "Pay Lightning" button charges the
 * platform's ZBD account while delegation purchase is still a 503, and "Zap"
 * pays the platform, not the agent owner. No server record is kept, so a
 * payment cannot even be found to refund it (bg48 Q-06). Keep both hidden until
 * purchase is wired end to end.
 */
export const LIGHTNING_PAY_ENABLED = process.env.NEXT_PUBLIC_LIGHTNING_PAY_ENABLED === 'true';
