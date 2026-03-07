"use client";

import { useState, useEffect } from "react";

export default function RotatingTagline() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const [blockHeight, setBlockHeight] = useState<string>("930,000+");

  // Fetch live block height
  useEffect(() => {
    fetch("https://mempool.space/api/blocks/tip/height")
      .then((r) => r.text())
      .then((h) => {
        const n = parseInt(h, 10);
        if (n > 0) setBlockHeight(n.toLocaleString());
      })
      .catch(() => {}); // keep fallback
  }, []);

  const taglines = [
    "Every Bitcoin block is a world.",
    `${blockHeight} blocks. ${blockHeight} worlds. One Nexus.`,
    "Sovereign land on Bitcoin. Powered by AI.",
    "The Bitcoin Metaverse.",
  ];

  useEffect(() => {
    const durations = { in: 400, hold: 2200, out: 400 };
    const timer = setTimeout(() => {
      if (phase === "in") setPhase("hold");
      else if (phase === "hold") setPhase("out");
      else {
        setIndex((i) => (i + 1) % taglines.length);
        setPhase("in");
      }
    }, durations[phase]);
    return () => clearTimeout(timer);
  }, [phase, taglines.length]);

  const opacity = phase === "hold" ? 1 : phase === "in" ? 1 : 0;
  const translateX = phase === "in" ? "0%" : phase === "hold" ? "0%" : "-8%";
  const blur = phase === "out" ? "4px" : "0px";

  return (
    <span
      style={{
        display: "inline-block",
        opacity,
        transform: `translateX(${translateX})`,
        filter: `blur(${blur})`,
        transition: "all 0.4s ease-in-out",
      }}
    >
      {taglines[index]}
    </span>
  );
}
