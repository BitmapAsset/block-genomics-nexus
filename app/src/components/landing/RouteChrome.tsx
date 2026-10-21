"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OnboardingFlow from "@/components/OnboardingFlow";
import BottomTabBar from "@/components/pwa/BottomTabBar";
import LandingHeader from "./LandingHeader";
import LandingFooter from "./LandingFooter";
import LandingBottomTabBar from "./LandingBottomTabBar";
import type { StatsData } from "@/hooks/useStats";

// The landing page ("/") keeps the header, footer, mobile tab bar and onboarding
// it had before the five-screen rework (bae6773d). Every other route uses the
// current ones.
function useIsLanding() {
  return usePathname() === "/";
}

export function SiteHeader() {
  return useIsLanding() ? <LandingHeader /> : <Header />;
}

// initialStats: the footer counters read on the server by the root layout.
export function SiteFooter({ className, initialStats = null }: { className?: string; initialStats?: StatsData | null }) {
  return useIsLanding()
    ? <LandingFooter className={className} initialStats={initialStats} />
    : <Footer className={className} initialStats={initialStats} />;
}

export function SiteBottomTabBar() {
  return useIsLanding() ? <LandingBottomTabBar /> : <BottomTabBar />;
}

export function LandingOnboarding() {
  return useIsLanding() ? <OnboardingFlow /> : null;
}
