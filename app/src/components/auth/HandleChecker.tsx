"use client";

import { useEffect, useMemo, useState } from "react";
import { getHandleRegistry } from "@/lib/auth-storage";

interface HandleCheckerProps {
  value: string;
  onChange: (value: string) => void;
  onValidChange?: (isValid: boolean) => void;
}

const HANDLE_REGEX = /^[a-z0-9_]{3,20}$/;

export default function HandleChecker({ value, onChange, onValidChange }: HandleCheckerProps) {
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  const isValid = useMemo(() => HANDLE_REGEX.test(value), [value]);

  useEffect(() => {
    if (!value) {
      setAvailability("idle");
      setMessage("");
      onValidChange?.(false);
      return;
    }

    if (!isValid) {
      setAvailability("idle");
      setMessage("3-20 chars, lowercase letters, numbers, underscores");
      onValidChange?.(false);
      return;
    }

    setAvailability("checking");
    const timer = setTimeout(() => {
      const registry = getHandleRegistry();
      if (registry[value]) {
        setAvailability("taken");
        setMessage("Handle already taken");
        onValidChange?.(false);
      } else {
        setAvailability("available");
        setMessage("Handle is available");
        onValidChange?.(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, isValid, onValidChange]);

  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Handle</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder="your_handle"
          className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan/50 focus:outline-none focus:ring-1 focus:ring-accent-cyan/25 transition-colors"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {availability === "checking" && (
            <span className="text-xs text-text-muted">…</span>
          )}
          {availability === "available" && (
            <span className="text-success text-sm">✓</span>
          )}
          {availability === "taken" && <span className="text-red-400 text-sm">✕</span>}
        </div>
      </div>
      {message && (
        <p
          className={`mt-2 text-xs ${
            availability === "available" ? "text-success" : availability === "taken" ? "text-red-400" : "text-text-muted"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
