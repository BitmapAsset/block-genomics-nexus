"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGlobalWallet } from "@/context/GlobalWalletContext";

export default function ProfilePage() {
  const router = useRouter();
  const { isConnected, profile } = useGlobalWallet();

  useEffect(() => {
    if (isConnected && profile?.handle) {
      router.replace(`/agent/${profile.handle}`);
    } else {
      router.replace("/verify");
    }
  }, [isConnected, profile, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Redirecting...</p>
    </div>
  );
}
