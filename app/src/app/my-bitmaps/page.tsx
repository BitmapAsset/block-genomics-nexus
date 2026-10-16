import type { Metadata } from "next";
import MyBitmapsClient from "./my-bitmaps-client";

export const metadata: Metadata = {
  title: "My Bitmaps — Block Genomics",
  description:
    "Connect a Bitcoin wallet to see every bitmap it holds on-chain, verify each one with a single signature, and get its genome.",
  alternates: { canonical: "/my-bitmaps" },
};

export default function MyBitmapsPage() {
  return <MyBitmapsClient />;
}
