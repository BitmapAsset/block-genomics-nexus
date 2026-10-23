import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NotificationBanner from "@/components/NotificationBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageTransition from "@/components/PageTransition";
import BottomTabBar from "@/components/pwa/BottomTabBar";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import { getFooterStats } from "@/lib/footer-stats";

/**
 * The header, footer and mobile tab bar of every page except the landing.
 *
 * Chosen by the route tree on the server: the `(site)` group's layout and the
 * root not-found render this, the `(landing)` group renders its own. It used to
 * be a client-side `usePathname() === "/"` switch in the root layout, which
 * rendered this chrome on `/` whenever the server saw another pathname (the
 * landing's ISR regeneration in production) and then threw a hydration error.
 */
export default async function SiteChrome({ children }: { children: React.ReactNode }) {
  // Footer counters in the server HTML (cached; null → "—" until the client fetch).
  const footerStats = await getFooterStats();
  return (
    <>
      <Header />
      <NotificationBanner />
      <main className="flex-1 pb-16 md:pb-0">
        <ErrorBoundary>
          <PageTransition>{children}</PageTransition>
        </ErrorBoundary>
      </main>
      <Footer className="hidden md:block" initialStats={footerStats} />
      <BottomTabBar />
      <InstallPrompt />
    </>
  );
}
