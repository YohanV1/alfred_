// Shared domain types for the Execution Decision Layer.
// These describe the inputs (action + context), the computed signals,
// the model's decision, and the final trace object returned to the UI.

export type Decision =
  | "execute_silently"
  | "execute_and_notify"
  | "confirm"
  | "clarify"
  | "refuse";

export type Reversibility = "reversible" | "soft_reversible" | "irreversible";
export type TimeSensitivity = "none" | "same_day" | "imminent";
export type UserState = "active" | "idle_short" | "idle_long";

// A proposed action alfred_ is considering taking on the user's behalf.
// The descriptor is what a tool layer would emit; the signals module
// enriches it into objective, typed signals the policy can reason about.
export type ActionDescriptor = {
  category: string; // e.g. "send_email", "create_reminder", "cancel_subscription"
  summary: string; // short human-readable description
  reversibility: Reversibility;
  external_party: boolean;
  financial_amount: number | null;
  time_sensitivity: TimeSensitivity;
  // True iff this action does not mutate any state the user can observe.
  // Read-only actions (summarize, search) get a more permissive path under
  // the injection guardrail: we can still serve the user's request while
  // flagging injected content.
  read_only: boolean;
  // Free-form payload for display; never interpreted as instructions.
  payload?: Record<string, unknown>;
};

export type MessageRole = "user" | "assistant";
// `source` lets us mark content that came from outside the user's own words —
// email bodies, webhook payloads — so the injection detector knows where to look.
export type MessageSource = "direct" | "external_email_body" | "external_other";

export type Message = {
  role: MessageRole;
  content: string;
  // Minutes before "now" that this message was sent. Used to compute user_state
  // and proximity between conflicting directives without needing wall-clock time.
  minutesAgo: number;
  source?: MessageSource;
};

export type ComputedSignals = {
  // action-intrinsic
  category: string;
  reversibility: Reversibility;
  external_party: boolean;
  financial_amount: number | null;
  time_sensitivity: TimeSensitivity;
  // context-derived
  recent_directive_override: boolean;
  turns_since_user_confirmation: number;
  ambiguous_pronouns: string[];
  pending_clarification: boolean;
  user_state: UserState;
  // True iff a prior user message established a persistent rule alfred_ should
  // follow silently for this class of action ("from now on auto-archive
  // newsletters, don't ping me"). Drives the `standing_rule_silent` guardrail.
  matches_standing_rule: boolean;
  // adversarial
  injection_detected: boolean;
};

export type DecisionOutput = {
  decision: Decision;
  rationale: string;
  user_message: string | null;
  internal_notes: string;
};

export type GuardrailFired = {
  name: string;
  explanation: string;
  // What the model chose before we post-processed.
  modelDecision: Decision | null;
  // What we forced it to.
  forcedDecision: Decision;
};

export type FailureMode =
  | "timeout"
  | "malformed_output"
  | "missing_context"
  | null;

export type DecideRequest = {
  action: ActionDescriptor;
  conversationHistory: Message[];
  // When true, /api/decide injects a deliberately-malformed model response
  // so the UI can demonstrate the retry + refuse path end-to-end.
  simulateMalformedOutput?: boolean;
};

export type Trace = {
  input: {
    action: ActionDescriptor;
    conversationHistory: Message[];
  };
  signals: ComputedSignals;
  guardrailsFired: GuardrailFired[];
  prompt: { system: string; user: string };
  rawModelOutput: string;
  // Additional attempts if we had to retry on malformed output.
  retryRawOutputs: string[];
  parsedOutput: DecisionOutput | null;
  finalDecision: DecisionOutput;
  failureMode: FailureMode;
  latencyMs: number;
};
