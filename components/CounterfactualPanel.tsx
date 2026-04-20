"use client";

// "What would change this decision?" — 2-3 deterministic counterfactuals
// computed by flipping signals and re-running ONLY the guardrail layer.
// If the actual final decision was driven by the model (no guardrail fired),
// changes to code-side facts won't flip anything, and the panel renders an
// honest "no code-side flip would change this."

import { computeCounterfactuals } from "@/lib/counterfactuals";
import type { Trace } from "@/lib/types";
import { decisionLabel, decisionColor } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

export function CounterfactualPanel({ trace }: { trace: Trace }) {
  // We need the model's pre-guardrail output to do counterfactuals. If the
  // trace hit a failure mode (no parsedOutput), we can't meaningfully flip.
  if (!trace.parsedOutput) {
    return null;
  }

  const results = computeCounterfactuals(
    trace.parsedOutput,
    trace.signals,
    trace.input.action,
    trace.finalDecision.decision,
    3,
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            What would change this decision?
          </h3>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Deterministic counterfactuals — the model output is held constant;
            we flip each code-side signal and re-run the guardrails.
          </p>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-600">
          No code-side signal flip would change this decision. The outcome
          came from the model&apos;s own judgment, not the guardrails.
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {results.map((r, i) => {
            const fromC = decisionColor[r.originalDecision];
            const toC = decisionColor[r.counterfactualDecision];
            return (
              <li
                key={i}
                className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-[13px] leading-relaxed text-slate-800"
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px]">
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0 font-medium",
                      fromC.badge,
                    )}
                  >
                    {decisionLabel[r.originalDecision]}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0 font-medium",
                      toC.badge,
                    )}
                  >
                    {decisionLabel[r.counterfactualDecision]}
                  </span>
                </div>
                <span
                  // We render the description with simple **bold** rendering
                  // because the description format uses markdown emphasis for
                  // the signal name.
                  dangerouslySetInnerHTML={{
                    __html: r.description
                      .replace(
                        /\*\*(.+?)\*\*/g,
                        '<b class="text-slate-900">$1</b>',
                      )
                      .replace(
                        /`([^`]+)`/g,
                        '<code class="rounded bg-slate-100 px-1 py-0.5 text-[12px] font-mono text-slate-800">$1</code>',
                      ),
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
