"use client";

interface GenomeMiniProps {
  genomeHash: string;
  size?: number;
}

function pairToColor(pair: string) {
  const val = parseInt(pair, 16);
  const hue = (val / 255) * 360;
  return `hsl(${hue}, 80%, 55%)`;
}

export default function GenomeMini({ genomeHash, size = 64 }: GenomeMiniProps) {
  const pairs = [] as string[];
  for (let i = 0; i < genomeHash.length; i += 2) {
    pairs.push(genomeHash.slice(i, i + 2));
  }

  return (
    <div
      className="grid grid-cols-8 gap-1 rounded-xl border border-border bg-bg-secondary/60 p-2"
      style={{ width: size, height: size }}
    >
      {pairs.slice(0, 32).map((pair, idx) => (
        <div
          key={idx}
          className="rounded-sm"
          style={{ backgroundColor: pairToColor(pair) }}
        />
      ))}
    </div>
  );
}
