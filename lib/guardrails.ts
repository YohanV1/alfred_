// Deterministic guardrails. Pure functions, no server-only deps, so they can
// be imported from both the /api/decide orchestrator and from client code
// (the CounterfactualPanel re-runs this logic against hypothetical signals).

import type {
  ActionDescriptor,
  ComputedSignals,
  Decision,
  DecisionOutput,
  GuardrailFired,
} from "./types";

const SILENT_OR_NOTIFY: ReadonlySet<Decision> = new Set([
  "execute_silently",
  "execute_and_notify",
]);

// Appended to user_message when the injection-read-only branch fires, so the
// end user sees the flag even if the model forgot to include it.
export const INJECTION_FLAG_SUFFIX =
  "\n\n⚠ Security note: external content contained instructions attempting to manipulate alfred_. Those were ignored.";

export function applyGuardrails(
  modelOutput: DecisionOutput,
  signals: ComputedSignals,
  action: ActionDescriptor,
): { final: DecisionOutput; fired: GuardrailFired[] } {
  const fired: GuardrailFired[] = [];
  let decision = modelOutput.decision;
  let userMessage = modelOutput.user_message;
  const modelDecision = modelOutput.decision;

  // G1. Irreversible + (external party OR financial) → floor at confirm.
  if (
    signals.reversibility === "irreversible" &&
    (signals.external_party || signals.financial_amount !== null)
  ) {
    if (SILENT_OR_NOTIFY.has(decision)) {
      fired.push({
        name: "irreversible_external_or_financial",
        explanation:
          "Irreversible action with an external party or financial component — silent execution blocked, minimum is confirm.",
        modelDecision,
        forcedDecision: "confirm",
      });
      decision = "confirm";
    }
  }

  // G2. recent_directive_override → floor at confirm. Model retains upgrade
  // path to clarify/refuse on its own.
  if (signals.recent_directive_override && SILENT_OR_NOTIFY.has(decision)) {
    fired.push({
      name: "recent_directive_override",
      explanation:
        "User countermanded themselves recently (stale-affirmative trap) — silent execution blocked, minimum is confirm.",
      modelDecision,
      forcedDecision: "confirm",
    });
    decision = "confirm";
  }

  // G3. pending_clarification → force clarify.
  if (signals.pending_clarification && decision !== "clarify") {
    fired.push({
      name: "pending_clarification",
      explanation:
        "alfred_ has an unanswered question in-flight — staying in clarify until the user responds.",
      modelDecision,
      forcedDecision: "clarify",
    });
    decision = "clarify";
  }

  // G-standing. User pre-authorized silence for this class of action via a
  // standing rule ("from now on auto-archive newsletters, don't ping me").
  // If the model defaulted to execute_and_notify — its cautious preference —
  // downgrade to execute_silently so we honor the explicit instruction. This
  // is the ONE guardrail that lowers severity. It only fires for the narrow
  // silent→notify pair; any stricter decision (confirm/clarify/refuse) that
  // the model reached on its own is left alone, because safety concerns
  // should always beat a standing rule.
  if (
    signals.matches_standing_rule &&
    decision === "execute_and_notify"
  ) {
    fired.push({
      name: "standing_rule_silent",
      explanation:
        "User established a standing rule covering this action and asked not to be pinged. Downgrading execute_and_notify to execute_silently to honor the instruction.",
      modelDecision,
      forcedDecision: "execute_silently",
    });
    decision = "execute_silently";
    // The model's notify-flavored user_message ("reminder set for...") no
    // longer makes sense under silent execute — drop it.
    userMessage = null;
  }

  // G4 / G5. Injection handling splits on whether the action mutates state.
  if (signals.injection_detected) {
    if (action.read_only) {
      // Read-only: still serve the user's original request, but make sure the
      // injection is flagged in user_message. Cap at execute_and_notify so
      // the user actually sees the flag. If the model already chose something
      // stricter (confirm/clarify/refuse) we leave that alone.
      if (SILENT_OR_NOTIFY.has(decision)) {
        const needsNotify = decision === "execute_silently";
        if (needsNotify) {
          fired.push({
            name: "injection_read_only_notify",
            explanation:
              "Injection detected in external content; action is read-only so we still serve the request but force execute_and_notify so the user sees the flag.",
            modelDecision,
            forcedDecision: "execute_and_notify",
          });
          decision = "execute_and_notify";
        }
        // Ensure the flag text is present in the user_message.
        if (!userMessage || !userMessage.includes("Security note")) {
          userMessage = (userMessage ?? "") + INJECTION_FLAG_SUFFIX;
          // If we appended and didn't fire the upgrade above, still log that
          // we appended the flag so the trace shows why user_message differs.
          if (!needsNotify) {
            fired.push({
              name: "injection_flag_appended",
              explanation:
                "Injection detected; appended a standardized security flag to user_message.",
              modelDecision,
              forcedDecision: decision,
            });
          }
        }
      }
    } else {
      // Mutating action + injection → refuse. Hard stop. The model does not
      // get to choose to "just proceed safely" when external content is
      // actively trying to manipulate us into a mutation.
      if (decision !== "refuse") {
        fired.push({
          name: "injection_mutating_refuse",
          explanation:
            "Injection detected in external content AND the proposed action mutates state — refusing.",
          modelDecision,
          forcedDecision: "refuse",
        });
        decision = "refuse";
        userMessage =
          "I spotted what looks like an injection attempt in the content of this request. I'm not going to act on it — please re-check the source.";
      }
    }
  }

  if (decision === modelOutput.decision && userMessage === modelOutput.user_message) {
    return { final: modelOutput, fired };
  }

  // Derive the final user_message. Three layers:
  //   1. If a guardrail explicitly touched userMessage (including setting it
  //      to null), that wins — we need to be able to *erase* a stale message.
  //   2. If no guardrail changed the decision, the model's message stands.
  //   3. If a guardrail overrode the decision without touching the message,
  //      generate a decision-appropriate default — the model's original text
  //      was written for a different decision and is likely misleading now.
  const guardrailSetMessage = userMessage !== modelOutput.user_message;
  const decisionChanged = decision !== modelOutput.decision;
  const finalUserMessage: string | null = guardrailSetMessage
    ? userMessage
    : !decisionChanged
      ? modelOutput.user_message
      : decision === "execute_silently"
        ? null
        : decision === "confirm"
          ? `Want me to go ahead with: ${modelOutput.rationale}?`
          : decision === "clarify"
            ? "Quick check — can you confirm what you'd like me to do?"
            : modelOutput.user_message;

  const final: DecisionOutput = {
    ...modelOutput,
    decision,
    user_message: finalUserMessage,
    internal_notes:
      decision !== modelOutput.decision
        ? modelOutput.internal_notes +
          ` [Post-processing: guardrail overrode model decision from ${modelOutput.decision} to ${decision}.]`
        : modelOutput.internal_notes,
  };
  return { final, fired };
}
