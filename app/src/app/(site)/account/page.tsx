import type { Metadata } from "next";
import AccountClient from "./account-client";

export const metadata: Metadata = {
  title: "Account — Block Genomics",
  description: "Your wallet, agent sessions, agent tokens and badges on Block Genomics.",
  alternates: { canonical: "/account" },
  robots: { index: false },
};

export default function AccountPage() {
  return <AccountClient />;
}
