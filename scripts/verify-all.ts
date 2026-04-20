// Run every scenario against the live /api/decide endpoint and verify the
// final decision falls inside acceptableDecisions. Used for final-submission
// verification, not part of the CI surface.

import { scenarios } from "../lib/scenarios";

const BASE = process.env.BASE ?? "http://localhost:3000";

async function main() {
  let pass = 0;
  let fail = 0;

  for (const s of scenarios) {
    const started = Date.now();
    try {
      const res = await fetch(`${BASE}/api/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: s.action,
          conversationHistory: s.conversationHistory,
        }),
      });
      if (!res.ok) {
        fail++;
        console.log(`✗ ${s.id.padEnd(26)} HTTP ${res.status}`);
        continue;
      }
      const trace = await res.json();
      const actual = trace.finalDecision.decision;
      const ok = s.acceptableDecisions.includes(actual);
      const ms = Date.now() - started;
      const expected = s.acceptableDecisions.join("|");
      if (ok) {
        pass++;
        console.log(
          `✓ ${s.id.padEnd(26)} ${actual.padEnd(20)} (expected ${expected}, ${ms}ms)`,
        );
      } else {
        fail++;
        console.log(
          `✗ ${s.id.padEnd(26)} ${actual.padEnd(20)} (expected ${expected}, ${ms}ms)`,
        );
      }
    } catch (e) {
      fail++;
      console.log(`✗ ${s.id.padEnd(26)} ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n${pass}/${pass + fail} passed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
