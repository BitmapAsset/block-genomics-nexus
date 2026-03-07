"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: "block" | "agent" | "user";
  handle?: string;
  displayName?: string;
  height?: number;
  tier?: number;
  avatarUrl?: string;
  url: string;
  label?: string;
}

interface SearchResponse {
  success: boolean;
  data: {
    blocks: SearchResult[];
    agents: SearchResult[];
    users: SearchResult[];
  };
}

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse["data"] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const router = useRouter();

  // Flatten results for keyboard nav
  const allResults: SearchResult[] = results
    ? [...results.blocks, ...results.agents, ...results.users]
    : [];

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults(null);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    try {
      // Check if it's a pure block number — navigate directly to mempool if not in DB
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=8`);
      const json: SearchResponse = await res.json();

      // If numeric query and no block results, add a "Go to block" option
      const num = Number(q);
      if (!isNaN(num) && num > 0 && num < 1_000_000 && json.data.blocks.length === 0) {
        json.data.blocks.push({
          type: "block",
          height: Math.floor(num),
          url: `/block/${Math.floor(num)}`,
        });
      }

      setResults(json.data);
      setIsOpen(true);
      setSelectedIdx(-1);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Keyboard shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const navigate = (url: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && allResults[selectedIdx]) {
        navigate(allResults[selectedIdx].url);
      } else if (allResults.length > 0) {
        navigate(allResults[0].url);
      } else {
        // If pure number, go to block page directly
        const num = Number(query);
        if (!isNaN(num) && num > 0) {
          navigate(`/block/${Math.floor(num)}`);
        }
      }
    }
  };

  const tierColors: Record<number, string> = {
    1: "#f7931a", // gold
    2: "#00d4ff", // cyan
    3: "#a855f7", // purple
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative flex items-center">
        <svg
          className="absolute left-3 w-4 h-4 text-text-muted pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Search blocks, agents, users..."
          className="w-[180px] sm:w-[260px] lg:w-[320px] pl-9 pr-12 py-1.5 text-sm rounded-lg border border-border bg-bg-secondary/60 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#00ffcc]/50 focus:ring-1 focus:ring-[#00ffcc]/20 transition-all"
        />
        {/* Shortcut hint */}
        {!query && (
          <kbd className="absolute right-2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-text-muted border border-border rounded bg-bg-tertiary/50">
            ⌘K
          </kbd>
        )}
        {query && (
          <button
            onClick={() => { setQuery(""); setResults(null); setIsOpen(false); }}
            className="absolute right-2 text-text-muted hover:text-text-primary text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (results || loading) && (
        <div className="absolute top-full mt-2 left-0 right-0 min-w-[320px] max-h-[420px] overflow-y-auto rounded-xl border border-border bg-bg-primary/95 backdrop-blur-xl shadow-2xl z-[100]">
          {loading && (
            <div className="px-4 py-3 text-sm text-text-muted animate-pulse">Searching...</div>
          )}

          {!loading && allResults.length === 0 && query.length > 0 && (
            <div className="px-4 py-3 text-sm text-text-muted">No results for &ldquo;{query}&rdquo;</div>
          )}

          {/* Blocks */}
          {results && results.blocks.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                Blocks
              </div>
              {results.blocks.map((r, i) => {
                const idx = i;
                return (
                  <button
                    key={`block-${r.height}`}
                    onClick={() => navigate(r.url)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-tertiary/60 transition-colors ${selectedIdx === idx ? "bg-bg-tertiary/60" : ""}`}
                  >
                    <span className="text-lg">🧱</span>
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        Block #{r.height?.toLocaleString()}
                      </div>
                      {r.label && (
                        <div className="text-xs text-text-muted">{r.label}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Agents */}
          {results && results.agents.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                Agents
              </div>
              {results.agents.map((r, i) => {
                const idx = (results?.blocks.length || 0) + i;
                return (
                  <button
                    key={`agent-${r.handle}`}
                    onClick={() => navigate(r.url)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-tertiary/60 transition-colors ${selectedIdx === idx ? "bg-bg-tertiary/60" : ""}`}
                  >
                    <span className="text-lg">🤖</span>
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {r.displayName || r.handle}
                        {r.tier && (
                          <span
                            className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ color: tierColors[r.tier] || "#888", background: `${tierColors[r.tier] || "#888"}15` }}
                          >
                            T{r.tier}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">@{r.handle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Users */}
          {results && results.users.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                Users
              </div>
              {results.users.map((r, i) => {
                const idx = (results?.blocks.length || 0) + (results?.agents.length || 0) + i;
                return (
                  <button
                    key={`user-${r.handle}`}
                    onClick={() => navigate(r.url)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-tertiary/60 transition-colors ${selectedIdx === idx ? "bg-bg-tertiary/60" : ""}`}
                  >
                    <span className="text-lg">👤</span>
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {r.displayName || r.handle}
                        {r.tier && (
                          <span
                            className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ color: tierColors[r.tier] || "#888", background: `${tierColors[r.tier] || "#888"}15` }}
                          >
                            T{r.tier}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">@{r.handle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
