/**
 * `bg events poll` — long-poll the agent event stream, JSON lines to stdout.
 *
 * Cursor semantics: track the most-recent event timestamp we've printed and
 * pass it as `since` on the next request so we never re-print an event.
 * `--once` prints one batch and exits (useful for cron).
 */

import { pollAgentEvents, AgentEventRecord, apiBase } from "../lib/bg-api";

interface EventsOpts {
  agent?: string;
  since?: string;
  limit?: number;
  interval?: number; // seconds
  once?: boolean;
}

export async function runEventsPoll(subcommand: string | undefined, opts: EventsOpts): Promise<void> {
  if (subcommand && subcommand !== "poll") fail(`Unknown events sub-command: ${subcommand}. Try: bg events poll --agent <id>`);

  const agentId = opts.agent || process.env.BG_AGENT_ID;
  if (!agentId) fail("--agent <agentId> (or BG_AGENT_ID) is required");

  const limit = opts.limit ?? 50;
  const intervalMs = Math.max(1_000, (opts.interval ?? 5) * 1000);

  process.stderr.write(`[bg] polling ${apiBase()} agent=${agentId} every ${intervalMs / 1000}s\n`);

  let cursor: string | undefined = opts.since;

  const tick = async () => {
    try {
      const events: AgentEventRecord[] = await pollAgentEvents(agentId!, { since: cursor, limit });
      // API returns most-recent first; print oldest-first so JSON lines are ordered forward.
      const ordered = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      for (const ev of ordered) {
        if (cursor && ev.timestamp <= cursor) continue;
        process.stdout.write(JSON.stringify(ev) + "\n");
      }
      if (ordered.length > 0) {
        cursor = ordered[ordered.length - 1].timestamp;
      }
    } catch (err) {
      process.stderr.write(`[bg] poll error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  };

  if (opts.once) {
    await tick();
    return;
  }

  // Continuous loop with graceful shutdown on SIGINT.
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopped) {
    await tick();
    if (stopped) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
