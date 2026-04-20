"use client";

import { useEffect, useMemo, useState } from "react";
import { ScenarioPicker } from "@/components/ScenarioPicker";
import { DecisionCard } from "@/components/DecisionCard";
import { TracePanel } from "@/components/TracePanel";
import { ConversationEditor } from "@/components/ConversationEditor";
import { CounterfactualPanel } from "@/components/CounterfactualPanel";
import { scenarios, type Scenario } from "@/lib/scenarios";
import type { Message, Trace } from "@/lib/types";
import { decisionLabel } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

export default function Home() {
  const [selected, setSelected] = useState<Scenario>(scenarios[0]);
  // Editable conversation history. Initialized from the selected scenario,
  // reset whenever the user switches scenarios. The reviewer can tweak any
  // bubble inline and click Decide again to see the re-run.
  const [history, setHistory] = useState<Message[]>(
    scenarios[0].conversationHistory,
  );
  const [simulateMalformed, setSimulateMalformed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [thinkingLong, setThinkingLong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [showTrace, setShowTrace] = useState(true);

  // Surface a "thinking..." hint if the call runs long, so a slow call
  // doesn't feel hung.
  useEffect(() => {
    if (!loading) {
      setThinkingLong(false);
      return;
    }
    const t = setTimeout(() => setThinkingLong(true), 3000);
    return () => clearTimeout(t);
  }, [loading]);

  async function runDecide() {
    setLoading(true);
    setError(null);
    setTrace(null);
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: selected.action,
          conversationHistory: history,
          simulateMalformedOutput: simulateMalformed,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as Trace;
      setTrace(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const expectedPill = useMemo(() => {
    if (!trace) return null;
    const ok = selected.acceptableDecisions.includes(trace.finalDecision.decision);
    const label = selected.acceptableDecisions
      .map((d) => decisionLabel[d])
      .join(" or ");
    return (
      <div
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
          ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800",
        )}
        title="Comparison against the scenario's acceptable decisions."
      >
        {ok ? "within expectation" : "unexpected"} · expected {label}
      </div>
    );
  }, [trace, selected]);

  return (
    <div className="flex-1">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-base font-semibold text-slate-900">
                alfred_
              </span>
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                execution decision layer · prototype
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Given a proposed action and context, choose: execute silently,
              execute and notify, confirm, clarify, or refuse.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 py-8 md:grid-cols-[300px_1fr]">
        {/* LEFT */}
        <aside className="md:sticky md:top-6 md:self-start">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            Scenarios
          </div>
          <ScenarioPicker
            selectedId={selected.id}
            onSelect={(s) => {
              setSelected(s);
              setHistory(s.conversationHistory);
              setTrace(null);
              setError(null);
            }}
          />
        </aside>

        {/* RIGHT */}
        <main className="flex flex-col gap-6">
          {/* Scenario summary + controls */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Selected scenario
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              {selected.title}
            </h2>
            <p className="mt-1 text-[13px] text-slate-600">{selected.notes}</p>

            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Proposed action
              </div>
              <div className="text-[13px] text-slate-900">
                {selected.action.summary}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Conversation history
              </div>
              <ConversationEditor messages={history} onChange={setHistory} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={runDecide}
                disabled={loading}
                className={cn(
                  "inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white",
                  "hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {loading ? "Deciding…" : "Decide"}
              </button>

              <label className="inline-flex items-center gap-2 text-[12px] text-slate-600">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-slate-900"
                  checked={simulateMalformed}
                  onChange={(e) => setSimulateMalformed(e.target.checked)}
                />
                Simulate malformed model output (demo failure mode)
              </label>

              {thinkingLong && loading && (
                <span className="text-[12px] text-slate-500">
                  thinking…
                </span>
              )}
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-900">
              <b>Request failed.</b> {error}
            </div>
          )}

          {trace && (
            <>
              <section>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Decision
                  </div>
                  <button
                    onClick={() => setShowTrace((v) => !v)}
                    className="text-[12px] font-medium text-slate-600 hover:text-slate-900"
                  >
                    {showTrace ? "Hide trace" : "Show trace"}
                  </button>
                </div>
                {expectedPill}
                <div className="mt-2">
                  <DecisionCard
                    output={trace.finalDecision}
                    latencyMs={trace.latencyMs}
                  />
                </div>
              </section>

              <section>
                <CounterfactualPanel trace={trace} />
              </section>

              {showTrace && (
                <section>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Trace
                  </div>
                  <TracePanel trace={trace} />
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
