"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OnboardingFlow from "@/components/OnboardingFlow";
import LandingHeader from "./LandingHeader";
import LandingFooter from "./LandingFooter";

// The landing page ("/") keeps the header, footer and onboarding it had before
// the five-screen rework (bae6773d). Every other route uses the current ones.
function useIsLanding() {
  return usePathname() === "/";
}

export function SiteHeader() {
  return useIsLanding() ? <LandingHeader /> : <Header />;
}

export function SiteFooter({ className }: { className?: string }) {
  return useIsLanding() ? <LandingFooter className={className} /> : <Footer className={className} />;
}

export function LandingOnboarding() {
  return useIsLanding() ? <OnboardingFlow /> : null;
}
