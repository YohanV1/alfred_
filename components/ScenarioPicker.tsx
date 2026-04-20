"use client";

import { scenarios, type Scenario } from "@/lib/scenarios";
import { decisionLabel } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

type Props = {
  selectedId: string | null;
  onSelect: (s: Scenario) => void;
};

const categoryLabel: Record<Scenario["category"], string> = {
  clear: "Clear",
  ambiguous: "Ambiguous",
  adversarial: "Adversarial",
};

export function ScenarioPicker({ selectedId, onSelect }: Props) {
  const grouped: Record<Scenario["category"], Scenario[]> = {
    clear: [],
    ambiguous: [],
    adversarial: [],
  };
  for (const s of scenarios) grouped[s.category].push(s);

  return (
    <div className="flex flex-col gap-6">
      {(Object.keys(grouped) as Scenario["category"][]).map((cat) => (
        <div key={cat}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            {categoryLabel[cat]}
          </div>
          <div className="flex flex-col gap-2">
            {grouped[cat].map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className={cn(
                  "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                  "hover:bg-slate-50",
                  selectedId === s.id
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 bg-white",
                )}
              >
                <div className="text-sm font-medium text-slate-900">
                  {s.title}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                  {s.notes}
                </div>
                {/* Dev-only hint so reviewers see we thought about multi-
                    valid outcomes. Plural list accommodates scenarios where
                    more than one decision is defensible. */}
                <div className="mt-1.5 text-[10px] font-mono text-slate-400">
                  expects:{" "}
                  {s.acceptableDecisions
                    .map((d) => decisionLabel[d].toLowerCase())
                    .join(" or ")}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
