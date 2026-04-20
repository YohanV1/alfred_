"use client";

import type { DecisionOutput } from "@/lib/types";
import { decisionColor, decisionLabel } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";
import { SmsBubble } from "./SmsBubble";

type Props = {
  output: DecisionOutput;
  latencyMs?: number;
};

export function DecisionCard({ output, latencyMs }: Props) {
  const c = decisionColor[output.decision];
  return (
    <div className={cn("rounded-lg border p-5", c.card)}>
      <div className="mb-3 flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            c.badge,
          )}
        >
          {decisionLabel[output.decision]}
        </span>
        {typeof latencyMs === "number" && (
          <span className="text-xs text-slate-500">{latencyMs} ms</span>
        )}
      </div>
      <p className={cn("text-[15px] leading-relaxed", c.text)}>
        {output.rationale}
      </p>

      {output.user_message && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            What alfred_ would say
          </div>
          <SmsBubble
            side="right"
            sender="alfred_"
            timestamp="just now"
            tone="alfred"
          >
            {output.user_message}
          </SmsBubble>
        </div>
      )}

      <div className="mt-4 border-t border-slate-200/70 pt-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Internal notes
        </div>
        <p className="text-[13px] leading-relaxed text-slate-600">
          {output.internal_notes}
        </p>
      </div>
    </div>
  );
}
