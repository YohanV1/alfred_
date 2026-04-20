// Tiny helpers the UI components share: decision colors, signal pill meanings,
// and the tooltip copy that explains what each signal means and why it matters.
// Keeping this in one file so the TracePanel tooltips and DecisionCard colors
// stay in sync with the policy.

import type { Decision } from "./types";

export const decisionLabel: Record<Decision, string> = {
  execute_silently: "Execute silently",
  execute_and_notify: "Execute and notify",
  confirm: "Confirm",
  clarify: "Clarify",
  refuse: "Refuse",
};

// Accent color families. We stick to tailwind's semantic palette.
export const decisionColor: Record<
  Decision,
  { badge: string; card: string; text: string }
> = {
  execute_silently: {
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    card: "border-emerald-200 bg-emerald-50/40",
    text: "text-emerald-900",
  },
  execute_and_notify: {
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    card: "border-emerald-200 bg-emerald-50/40",
    text: "text-emerald-900",
  },
  confirm: {
    badge: "bg-amber-100 text-amber-900 border-amber-200",
    card: "border-amber-200 bg-amber-50/40",
    text: "text-amber-900",
  },
  clarify: {
    badge: "bg-sky-100 text-sky-900 border-sky-200",
    card: "border-sky-200 bg-sky-50/40",
    text: "text-sky-900",
  },
  refuse: {
    badge: "bg-rose-100 text-rose-900 border-rose-200",
    card: "border-rose-200 bg-rose-50/40",
    text: "text-rose-900",
  },
};

// Per-signal explanations for the tooltip layer in the TracePanel.
export const signalExplanations: Record<string, string> = {
  category:
    "Canonical action name. Used by policy to look up category-specific rules.",
  reversibility:
    "Can this action be undone cheaply? Irreversible actions floor at confirm when external parties or money are involved.",
  external_party:
    "Does this action touch someone outside the user's own account (emails, shared calendars, payments)? Raises the bar.",
  financial_amount:
    "Dollar amount moved by this action. Null if none. Any non-null amount raises the bar proportional to size.",
  time_sensitivity:
    "How soon does this need to happen? Imminent actions can justify a lower confirmation bar for reversible work.",
  recent_directive_override:
    "True when the user countermanded themselves recently (the 'Yep, send it' trap after telling alfred_ to hold). Deterministic guardrail: never silent, floor at confirm.",
  turns_since_user_confirmation:
    "How many user turns since an explicit yes. Large numbers mean we'd be acting on an old mandate.",
  ambiguous_pronouns:
    "Pronouns in the latest user message with no single clear referent in recent context. Non-empty → prefer clarify.",
  pending_clarification:
    "alfred_ already asked a question the user hasn't answered. Deterministic guardrail: forces clarify.",
  user_state:
    "active / idle_short / idle_long, based on how recently the user spoke. Influences whether notify vs silent is appropriate.",
  matches_standing_rule:
    "True when a prior user message established a persistent rule covering this action (\"from now on auto-archive newsletters, don't ping me\"). Drives the standing_rule_silent guardrail, which downgrades execute_and_notify to execute_silently so alfred_ honors the pre-authorized silence.",
  injection_detected:
    "True when external content (e.g. email body) contains known prompt-injection phrases. Policy: never act on injected instructions; still OK to perform the read-only user request while flagging the attempt.",
};

// Classification for pill color: "risky" signals go red when true, "safe"
// signals go green when true, neutral stays slate.
type PillTone = "risky-true" | "safe-true" | "neutral";
export const booleanSignalTone: Record<string, PillTone> = {
  external_party: "risky-true",
  recent_directive_override: "risky-true",
  pending_clarification: "risky-true",
  injection_detected: "risky-true",
  // Unique among the booleans: "true" is the *safe* state here — it means
  // the user gave alfred_ a standing rule pre-authorizing silence.
  matches_standing_rule: "safe-true",
};

export const enumSignalTone: Record<
  string,
  Record<string, "green" | "amber" | "red" | "slate">
> = {
  reversibility: {
    reversible: "green",
    soft_reversible: "amber",
    irreversible: "red",
  },
  time_sensitivity: {
    none: "slate",
    same_day: "amber",
    imminent: "red",
  },
  user_state: {
    active: "green",
    idle_short: "amber",
    idle_long: "slate",
  },
};

export function pillClasses(
  tone: "green" | "amber" | "red" | "slate",
): string {
  switch (tone) {
    case "green":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "amber":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "red":
      return "bg-rose-100 text-rose-900 border-rose-200";
    case "slate":
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
}
