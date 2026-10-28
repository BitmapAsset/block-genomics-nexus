import NotificationBanner from "@/components/NotificationBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageTransition from "@/components/PageTransition";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import OnboardingFlow from "@/components/OnboardingFlow";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingBottomTabBar from "@/components/landing/LandingBottomTabBar";
import { getFooterStats } from "@/lib/footer-stats";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { LANDING_GRAPH } from "@/lib/seo-schema";

// Head-only SEO for "/": canonical + structured data. No visible output.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * The landing ("/") keeps the header, footer, mobile tab bar and onboarding it
 * had before the five-screen rework (bae6773d). The route group decides that on
 * the server, so the server HTML, the hydrated page and every ISR regeneration
 * carry the same chrome. Same element order as SiteChrome.
 */
export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  const footerStats = await getFooterStats();
  return (
    <>
      <JsonLd data={LANDING_GRAPH} />
      <LandingHeader />
      <NotificationBanner />
      <main className="flex-1 pb-16 md:pb-0">
        <ErrorBoundary>
          <PageTransition>{children}</PageTransition>
        </ErrorBoundary>
      </main>
      <LandingFooter className="hidden md:block" initialStats={footerStats} />
      <LandingBottomTabBar />
      <InstallPrompt />
      <OnboardingFlow />
    </>
  );
}
