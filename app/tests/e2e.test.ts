#!/usr/bin/env tsx
/* eslint-disable no-console */

type TestResult = { name: string; ok: boolean; details?: string };

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, ok: true };
  } catch (error) {
    return {
      name,
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json();
  return { res, body } as const;
}

async function getText(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.text();
  return { res, body } as const;
}

async function main() {
  const tests: Array<Promise<TestResult>> = [];

  tests.push(
    runTest("GET /api/health returns ok", async () => {
      const { res, body } = await getJson("/api/health");
      assert(res.ok, `status ${res.status}`);
      assert(body.status === "ok", "status not ok");
      assert(body.database === "connected", "database not connected");
    })
  );

  tests.push(
    runTest("GET /api/v1/search?q=pepe returns Pepe agent", async () => {
      const { res, body } = await getJson("/api/v1/search?q=pepe");
      assert(res.ok, `status ${res.status}`);
      assert(Array.isArray(body.results), "results not array");
      const hasPepe = body.results.some(
        (r: any) =>
          r.type === "agent" &&
          (r.id === "bg_pepe" || /pepe/i.test(r.name))
      );
      assert(hasPepe, "Pepe agent not found in results");
    })
  );

  tests.push(
    runTest("GET /api/v1/search?q=100000 returns block 100000", async () => {
      const { res, body } = await getJson("/api/v1/search?q=100000");
      assert(res.ok, `status ${res.status}`);
      const hasBlock = body.results.some(
        (r: any) => r.type === "block" && r.blockHeight === 100000
      );
      assert(hasBlock, "Block 100000 not found in results");
    })
  );

  tests.push(
    runTest("GET /api/v1/leaderboard returns array", async () => {
      const { res, body } = await getJson("/api/v1/leaderboard");
      assert(res.ok, `status ${res.status}`);
      assert(Array.isArray(body.leaderboard), "leaderboard not array");
    })
  );

  tests.push(
    runTest("GET /api/v1/block/100000 returns block with genome", async () => {
      const { res, body } = await getJson("/api/v1/block/100000");
      assert(res.ok, `status ${res.status}`);
      assert(body.block?.height === 100000, "block height mismatch");
      assert(body.genome?.sequence, "genome missing");
    })
  );

  tests.push(
    runTest("GET /api/v1/agent/bg_pepe returns agent data", async () => {
      const { res, body } = await getJson("/api/v1/agent/bg_pepe");
      assert(res.ok, `status ${res.status}`);
      assert(body.agent?.id === "bg_pepe", "agent id mismatch");
    })
  );

  tests.push(
    runTest("POST /api/v1/challenge returns challenge", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockHeight: 100000 }),
      });
      const body = await res.json();
      assert(res.ok, `status ${res.status}`);
      assert(body.challengeId, "challengeId missing");
      assert(body.genome?.sequence, "genome missing");
      assert(body.message, "message missing");
    })
  );

  tests.push(
    runTest("POST /api/v1/challenge invalid block handled", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockHeight: -1 }),
      });
      const body = await res.json();
      assert(!res.ok, `expected error status, got ${res.status}`);
      assert(body.error, "error message missing");
    })
  );

  tests.push(
    runTest("GET /api/v1/badge/bg_genesis returns badge", async () => {
      const { res, body } = await getText("/api/v1/badge/bg_genesis");
      assert(res.ok, `status ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      assert(contentType.includes("image/svg+xml"), "content-type not svg");
      assert(body.includes("Badge"), "svg body unexpected");
    })
  );

  const pages = [
    "/",
    "/explore",
    "/verify",
    "/leaderboard",
    "/agent/bg_pepe",
    "/block/100000",
  ];

  for (const page of pages) {
    tests.push(
      runTest(`GET ${page} returns 200`, async () => {
        const res = await fetch(`${BASE_URL}${page}`);
        assert(res.status === 200, `status ${res.status}`);
      })
    );
  }

  const results = await Promise.all(tests);
  const failed = results.filter((r) => !r.ok);

  for (const result of results) {
    if (result.ok) {
      console.log(`✅ ${result.name}`);
    } else {
      console.log(`❌ ${result.name} - ${result.details}`);
    }
  }

  if (failed.length) {
    console.error(`\n${failed.length} test(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} tests passed.`);
}

main();
