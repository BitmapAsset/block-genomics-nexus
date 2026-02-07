"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { truncateHash, formatNumber, hexPairToColor } from "@/lib/genome-utils";

interface SearchResult {
  type: "agent" | "block";
  id: string;
  name: string;
  blockHeight: number;
  genome: string | null;
  trustScore: number | null;
  matchField: string;
}

interface SearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
}

export default function SearchBar({ apiUrl }: { apiUrl: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setOpen(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `${apiUrl}/api/v1/agent/?q=${encodeURIComponent(q.trim())}&limit=10`
        );
        if (!res.ok) throw new Error("Search failed");
        const data: SearchResponse = await res.json();
        setResults(data.results || []);

        // Also add a direct block link if query is a number
        const height = parseInt(q, 10);
        if (!isNaN(height) && height >= 0) {
          const blockResult: SearchResult = {
            type: "block",
            id: String(height),
            name: `Block #${height.toLocaleString()}`,
            blockHeight: height,
            genome: null,
            trustScore: null,
            matchField: "blockHeight",
          };
          // Only add if not already present
          if (!data.results?.find((r) => r.type === "block" && r.blockHeight === height)) {
            setResults((prev) => [blockResult, ...prev]);
          }
        }

        setOpen(true);
      } catch {
        setError("Search unavailable");
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    },
    [apiUrl]
  );

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    search(query);
  };

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit}>
        <div className="glass-panel p-1 glow-cyan">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => handleInput(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                placeholder="Search by block height, agent name, or genome prefix…"
                className="w-full rounded-lg bg-transparent pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-accent-cyan/10 px-6 py-3 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/20 transition-colors"
            >
              {loading ? (
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                "Search"
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Results dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 glass-panel p-2 shadow-xl z-50 max-h-80 overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          {!error && results.length === 0 && query.trim() && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-text-muted">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          )}

          {results.map((result, i) => (
            <Link
              key={`${result.type}-${result.id}-${i}`}
              href={
                result.type === "block"
                  ? `/block/${result.blockHeight}`
                  : `/agent/${result.id}`
              }
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-bg-tertiary/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Icon / genome swatch */}
                {result.type === "block" ? (
                  <span className="text-bitcoin text-sm shrink-0">₿</span>
                ) : result.genome ? (
                  <div className="flex gap-0.5 shrink-0">
                    {[0, 2, 4].map((j) => (
                      <div
                        key={j}
                        className="w-1.5 h-4 rounded-sm"
                        style={{
                          backgroundColor: hexPairToColor(
                            result.genome!.slice(j, j + 2)
                          ),
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-accent-purple text-sm shrink-0">🤖</span>
                )}

                <div className="min-w-0">
                  <p className="text-sm font-medium group-hover:text-accent-cyan transition-colors truncate">
                    {result.name}
                  </p>
                  <p className="text-xs text-text-muted font-mono">
                    {result.type === "block"
                      ? `Block #${formatNumber(result.blockHeight)}`
                      : `Block #${formatNumber(result.blockHeight)} · ${truncateHash(result.id, 6)}`}
                  </p>
                </div>
              </div>

              {result.trustScore !== null && (
                <span className="text-xs font-bold text-gradient-cyan-purple shrink-0 ml-2">
                  {result.trustScore}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
