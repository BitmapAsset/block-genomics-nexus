"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useGlobalWallet } from "@/context/GlobalWalletContext";

const ONBOARDING_KEY = "bg-onboarding-complete";

function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

function markOnboardingComplete() {
  try { localStorage.setItem(ONBOARDING_KEY, "true"); } catch {}
}

interface Step {
  id: number;
  title: string;
  description: string;
  icon: string;
  actionLabel?: string;
  actionHref?: string;
}

const STEPS: Step[] = [
  {
    id: 1,
    title: "Connect Your Wallet",
    description: "Link a Bitcoin wallet (Unisat, Xverse, or Leather) to get started. Your wallet proves your identity on the Bitcoin blockchain.",
    icon: "wallet",
  },
  {
    id: 2,
    title: "Verify a Block",
    description: "If you own a Bitmap inscription, verify ownership to create your unique Block Genome — a digital DNA anchored to Bitcoin's proof of work.",
    icon: "shield",
    actionLabel: "Verify a Block",
    actionHref: "/verify",
  },
  {
    id: 3,
    title: "Meet Your Guardian",
    description: "Each verified block gets a Guardian AI — an autonomous agent that protects your territory, manages your world, and interacts with visitors.",
    icon: "brain",
    actionLabel: "Learn About Guardians",
    actionHref: "/brain",
  },
  {
    id: 4,
    title: "Explore the Nexus",
    description: "Enter the Nexus — a massive decentralized metaverse where every Bitcoin block is a 2.1km x 2.1km district of sovereign digital land.",
    icon: "globe",
    actionLabel: "Enter the Nexus",
    actionHref: "/nexus",
  },
];

/* ─── Confetti Particle ─── */
function ConfettiPiece({ delay, x }: { delay: number; x: number }) {
  const colors = ["#f7931a", "#00ffcc", "#a855f7", "#22c55e", "#ff6b6b", "#FFD700"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const size = 4 + Math.random() * 6;
  const rotation = Math.random() * 360;

  return (
    <motion.div
      initial={{ y: -20, x, opacity: 1, rotate: 0 }}
      animate={{
        y: 400 + Math.random() * 200,
        x: x + (Math.random() - 0.5) * 300,
        opacity: 0,
        rotate: rotation + 360 * (Math.random() > 0.5 ? 1 : -1),
      }}
      transition={{ duration: 2 + Math.random(), delay, ease: "easeOut" }}
      className="absolute top-0 pointer-events-none"
      style={{
        width: size,
        height: size * (Math.random() > 0.5 ? 1 : 2.5),
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? "50%" : "2px",
      }}
    />
  );
}

/* ─── Confetti Burst ─── */
function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.5,
    x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 400),
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} delay={p.delay} x={p.x} />
      ))}
    </div>
  );
}

/* ─── Step Icon ─── */
function StepIcon({ icon, active, completed }: { icon: string; active: boolean; completed: boolean }) {
  const paths: Record<string, string> = {
    wallet: "M21 12V7H5a2 2 0 010-4h14v4 M3 5v14a2 2 0 002 2h16v-5 M18 12a1 1 0 100 2 1 1 0 000-2z",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    brain: "M12 2a8 8 0 018 8c0 3.5-2 6-4 7.5V19a1 1 0 01-1 1h-2v2h-2v-2H9a1 1 0 01-1-1v-1.5C6 16 4 13.5 4 10a8 8 0 018-8z M9 10h.01 M15 10h.01",
    globe: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
  };

  return (
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
      completed
        ? "bg-success/20 border-2 border-success/40"
        : active
        ? "bg-accent-cyan/15 border-2 border-accent-cyan/40 shadow-lg shadow-accent-cyan/10"
        : "bg-bg-tertiary/50 border-2 border-border"
    }`}>
      {completed ? (
        <svg className="w-7 h-7 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          className={`w-7 h-7 transition-colors ${active ? "text-accent-cyan" : "text-text-muted"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {(paths[icon] || paths.globe).split(" M").map((d, i) => (
            <path key={i} d={i === 0 ? d : `M${d}`} />
          ))}
        </svg>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export default function OnboardingFlow() {
  const { isConnected } = useGlobalWallet();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  // Show onboarding for first-time connected users
  useEffect(() => {
    if (isConnected && !isOnboardingComplete()) {
      // Small delay for smooth entrance
      const t = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(t);
    }
  }, [isConnected]);

  // Auto-advance step 1 when wallet connected
  useEffect(() => {
    if (isConnected && step === 0) {
      setStep(1);
    }
  }, [isConnected, step]);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      // Complete!
      setShowConfetti(true);
      setTimeout(() => {
        markOnboardingComplete();
        setVisible(false);
        setShowConfetti(false);
      }, 3000);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    markOnboardingComplete();
    setVisible(false);
  }, []);

  if (!visible) return null;

  const currentStep = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      {showConfetti && <Confetti />}

      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg glass-panel p-0 overflow-hidden"
            >
              {/* Progress bar */}
              <div className="h-1 bg-bg-tertiary">
                <motion.div
                  className="h-full"
                  style={{ background: "linear-gradient(90deg, #00ffcc, #a855f7, #f7931a)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              {/* Step indicators */}
              <div className="flex items-center justify-center gap-3 pt-6 px-6">
                {STEPS.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <button
                      onClick={() => i <= step && setStep(i)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        i < step
                          ? "bg-success/20 text-success border border-success/30 cursor-pointer"
                          : i === step
                          ? "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/40"
                          : "bg-bg-tertiary text-text-muted border border-border"
                      }`}
                    >
                      {i < step ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        i + 1
                      )}
                    </button>
                    {i < STEPS.length - 1 && (
                      <div className={`w-8 h-0.5 rounded ${i < step ? "bg-success/30" : "bg-border"}`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="px-6 py-8 text-center"
                >
                  <div className="flex justify-center mb-5">
                    <StepIcon
                      icon={currentStep.icon}
                      active={true}
                      completed={step > STEPS.indexOf(currentStep)}
                    />
                  </div>

                  <h2 className="text-xl font-bold text-text-primary mb-3">{currentStep.title}</h2>
                  <p className="text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
                    {currentStep.description}
                  </p>

                  {/* Step 1: Wallet connection */}
                  {step === 0 && !isConnected && (
                    <div className="mt-6">
                      <button
                        onClick={() => window.dispatchEvent(new Event("open-wallet-modal"))}
                        className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/25 transition-all cursor-pointer"
                      >
                        Connect Wallet
                      </button>
                    </div>
                  )}

                  {/* Action button for other steps */}
                  {currentStep.actionHref && step > 0 && (
                    <div className="mt-6">
                      <Link
                        href={currentStep.actionHref}
                        onClick={handleSkip}
                        className="inline-block px-5 py-2 rounded-lg text-sm font-medium bg-bg-tertiary/50 border border-border text-text-secondary hover:border-border-hover hover:text-text-primary transition-all"
                      >
                        {currentStep.actionLabel}
                      </Link>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <button
                  onClick={handleSkip}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                  Skip tour
                </button>

                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <button
                      onClick={() => setStep((s) => s - 1)}
                      className="px-4 py-2 text-xs rounded-lg border border-border text-text-secondary hover:border-border-hover transition-all cursor-pointer"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    disabled={step === 0 && !isConnected}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/25 transition-all disabled:opacity-30 cursor-pointer disabled:cursor-default"
                  >
                    {step === STEPS.length - 1 ? "Get Started!" : "Next"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
