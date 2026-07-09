/**
 * `bg heartbeat` — send a heartbeat to keep an agent marked as active.
 * With `--loop`, sends every N seconds until Ctrl+C. Prints the server's
 * lastHeartbeat timestamp as JSON on each tick.
 */

import { heartbeatAgent, apiBase } from "../lib/bg-api";

interface HeartbeatOpts {
  agent?: string;
  interval?: number; // seconds, only used with --loop
  loop?: boolean;
  json?: boolean;
}

export async function runHeartbeat(opts: HeartbeatOpts): Promise<void> {
  const agentId = opts.agent || process.env.BG_AGENT_ID;
  if (!agentId) fail("--agent <agentId> (or BG_AGENT_ID) is required");

  const tick = async () => {
    const r = await heartbeatAgent(agentId!);
    if (opts.json) {
      process.stdout.write(JSON.stringify(r) + "\n");
    } else {
      process.stdout.write(`💓 ${r.lastHeartbeat}\n`);
    }
  };

  if (!opts.loop) {
    await tick();
    return;
  }

  const intervalMs = Math.max(1_000, (opts.interval ?? 30) * 1000);
  process.stderr.write(`[bg] heartbeat loop ${apiBase()} agent=${agentId} every ${intervalMs / 1000}s\n`);
  let stopped = false;
  process.on("SIGINT", () => { stopped = true; });
  process.on("SIGTERM", () => { stopped = true; });
  while (!stopped) {
    try {
      await tick();
    } catch (err) {
      process.stderr.write(`[bg] heartbeat error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    if (stopped) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}
