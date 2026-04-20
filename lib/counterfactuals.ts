// Counterfactual reasoning over the decision surface. Pure, deterministic,
// no LLM call. Given the model's pre-guardrail output and the action, we
// flip each signal one at a time, re-run the guardrail post-processing, and
// surface any flips that change the FINAL decision.
//
// This is cheap: we hold the model's parsed output constant and only poke
// the deterministic post-processing. That's the whole point — the model has
// already judged the case; we're asking "which code-side fact would have
// moved us?"

import { applyGuardrails } from "./guardrails";
import type {
  ActionDescriptor,
  ComputedSignals,
  Decision,
  DecisionOutput,
} from "./types";

export type Counterfactual = {
  signal: keyof ComputedSignals | "financial_amount_zeroed" | "reversibility_softened";
  description: string; // user-facing explanation like "If recent_directive_override were false..."
  originalDecision: Decision;
  counterfactualDecision: Decision;
};

const DECISION_SEVERITY: Record<Decision, number> = {
  execute_silently: 0,
  execute_and_notify: 1,
  confirm: 2,
  clarify: 3,
  refuse: 4,
};

// Severity delta for ordering — biggest flip surfaces first.
function delta(a: Decision, b: Decision): number {
  return Math.abs(DECISION_SEVERITY[a] - DECISION_SEVERITY[b]);
}

// Produce the list of "flipped signal" variations to try. Each entry is a
// function that returns a tuple { signals, action, description }. We vary
// the action too (read_only, reversibility) because those are action-intrinsic
// facts that still flow through the guardrails.
function makeFlips(
  signals: ComputedSignals,
  action: ActionDescriptor,
): Array<{
  key: Counterfactual["signal"];
  signals: ComputedSignals;
  action: ActionDescriptor;
  description: (newDec: Decision) => string;
}> {
  const flips: Array<{
    key: Counterfactual["signal"];
    signals: ComputedSignals;
    action: ActionDescriptor;
    description: (newDec: Decision) => string;
  }> = [];

  // Booleans — simple negation.
  for (const k of [
    "external_party",
    "recent_directive_override",
    "pending_clarification",
    "injection_detected",
    "matches_standing_rule",
  ] as const) {
    flips.push({
      key: k,
      signals: { ...signals, [k]: !signals[k] },
      action,
      description: (newDec) =>
        `If \`${k}\` were ${!signals[k]}, this would be **${newDec}**.`,
    });
  }

  // Reversibility — try softening (irreversible → soft_reversible → reversible).
  if (signals.reversibility !== "reversible") {
    const softer =
      signals.reversibility === "irreversible"
        ? "soft_reversible"
        : "reversible";
    flips.push({
      key: "reversibility_softened",
      signals: { ...signals, reversibility: softer },
      action: { ...action, reversibility: softer },
      description: (newDec) =>
        `If this action were \`${softer}\` instead of \`${signals.reversibility}\`, this would be **${newDec}**.`,
    });
  }

  // Financial amount — try zeroing it out (or introducing one).
  if (signals.financial_amount !== null) {
    flips.push({
      key: "financial_amount_zeroed",
      signals: { ...signals, financial_amount: null },
      action: { ...action, financial_amount: null },
      description: (newDec) =>
        `If \`financial_amount\` were null instead of $${signals.financial_amount?.toLocaleString()}, this would be **${newDec}**.`,
    });
  }

  // Read-only: if action is mutating, try read-only; otherwise try mutating.
  flips.push({
    key: "injection_detected", // reuse key for sort purposes; distinct via description
    signals,
    action: { ...action, read_only: !action.read_only },
    description: (newDec) =>
      `If this action were ${action.read_only ? "mutating" : "read-only"}, this would be **${newDec}**.`,
  });

  return flips;
}

export function computeCounterfactuals(
  modelOutput: DecisionOutput,
  signals: ComputedSignals,
  action: ActionDescriptor,
  actualFinal: Decision,
  limit = 3,
): Counterfactual[] {
  const results: Counterfactual[] = [];
  const seen = new Set<string>();

  for (const flip of makeFlips(signals, action)) {
    const { final } = applyGuardrails(modelOutput, flip.signals, flip.action);
    const newDec = final.decision;
    if (newDec === actualFinal) continue;

    const key = `${flip.key}:${newDec}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      signal: flip.key,
      description: flip.description(newDec),
      originalDecision: actualFinal,
      counterfactualDecision: newDec,
    });
  }

  // Order by biggest decision delta first.
  results.sort(
    (a, b) =>
      delta(b.originalDecision, b.counterfactualDecision) -
      delta(a.originalDecision, a.counterfactualDecision),
  );
  return results.slice(0, limit);
}
