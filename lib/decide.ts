// Orchestrator. Computes signals, builds the prompt, calls the model with a
// timeout, parses + validates, retries once on malformed output, applies
// deterministic guardrails, and returns a full Trace.

import Anthropic from "@anthropic-ai/sdk";
import { decisionOutputSchema } from "./schema";
import { computeSignals } from "./signals";
import { buildPrompt, buildRetrySystemPrompt } from "./prompt";
import { applyGuardrails } from "./guardrails";
import type {
  ActionDescriptor,
  DecisionOutput,
  FailureMode,
  Message,
  Trace,
} from "./types";

const MODEL = "claude-sonnet-4-5";
const TIMEOUT_MS = 20_000;

// Stable refusal messages — centralized so the UI and trace agree on wording.
const TIMEOUT_REFUSAL: DecisionOutput = {
  decision: "refuse",
  rationale:
    "alfred_ could not reach the decision service in time, escalating.",
  user_message:
    "I'm having trouble reaching my decision service right now. Want me to try again in a minute?",
  internal_notes:
    "Model call exceeded 20s timeout. Returned refuse to fail safe.",
};

const MALFORMED_REFUSAL: DecisionOutput = {
  decision: "refuse",
  rationale:
    "alfred_ could not parse a confident decision, escalating.",
  user_message:
    "I wasn't able to form a confident decision on that. Can you rephrase or break it into smaller steps?",
  internal_notes:
    "Model output failed Zod validation on the initial call and on retry. Returned refuse to fail safe.",
};

// ---------- model call ----------

async function callModel(
  system: string,
  user: string,
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: user }],
  });
  // Stitch together text blocks. We ignore tool_use / other block types.
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ---------- parsing ----------

function stripFences(raw: string): string {
  // Defensive: models sometimes return ```json ... ``` despite instructions.
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  // Occasionally a model wraps with a prefix like "Here is the JSON:" —
  // grab the first { ... } block if present.
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  return s.trim();
}

function tryParse(raw: string): DecisionOutput | null {
  try {
    const stripped = stripFences(raw);
    const json = JSON.parse(stripped);
    const parsed = decisionOutputSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------- top-level orchestrator ----------

export async function decide(
  action: ActionDescriptor,
  history: Message[],
  opts: { simulateMalformedOutput?: boolean } = {},
): Promise<Trace> {
  const started = Date.now();
  const signals = computeSignals(action, history);
  const prompt = buildPrompt(action, signals, history);

  // Missing-context short-circuit. We short-circuit BEFORE calling the model
  // to save a round-trip on obviously under-specified inputs.
  if (!action.category || action.category.trim() === "") {
    const missing: DecisionOutput = {
      decision: "clarify",
      rationale: "alfred_ needs more detail before it can act.",
      user_message:
        "I don't have enough to act on yet — can you give me a bit more about what you'd like?",
      internal_notes:
        "Action descriptor was missing a category. Short-circuited to clarify.",
    };
    return {
      input: { action, conversationHistory: history },
      signals,
      guardrailsFired: [],
      prompt,
      rawModelOutput: "",
      retryRawOutputs: [],
      parsedOutput: null,
      finalDecision: missing,
      failureMode: "missing_context",
      latencyMs: Date.now() - started,
    };
  }

  let rawModelOutput = "";
  const retryRawOutputs: string[] = [];
  let parsed: DecisionOutput | null = null;
  let failureMode: FailureMode = null;

  // ---- call 1 ----
  try {
    if (opts.simulateMalformedOutput) {
      rawModelOutput =
        "Sure thing! Here's what I think: we should probably just send it. (This is deliberately not JSON.)";
    } else {
      rawModelOutput = await withTimeout(
        callModel(prompt.system, prompt.user),
        TIMEOUT_MS,
      );
    }
    parsed = tryParse(rawModelOutput);
  } catch (e) {
    if (e instanceof Error && e.message === "timeout") {
      failureMode = "timeout";
      return {
        input: { action, conversationHistory: history },
        signals,
        guardrailsFired: [],
        prompt,
        rawModelOutput,
        retryRawOutputs,
        parsedOutput: null,
        finalDecision: TIMEOUT_REFUSAL,
        failureMode,
        latencyMs: Date.now() - started,
      };
    }
    // Unexpected error — treat as malformed and continue to retry path.
    rawModelOutput = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // ---- retry once on malformed ----
  if (!parsed) {
    try {
      const retryRaw = opts.simulateMalformedOutput
        ? "Still not JSON, sorry."
        : await withTimeout(
            callModel(buildRetrySystemPrompt(), prompt.user),
            TIMEOUT_MS,
          );
      retryRawOutputs.push(retryRaw);
      parsed = tryParse(retryRaw);
    } catch (e) {
      retryRawOutputs.push(
        `ERROR: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (!parsed) {
    failureMode = "malformed_output";
    return {
      input: { action, conversationHistory: history },
      signals,
      guardrailsFired: [],
      prompt,
      rawModelOutput,
      retryRawOutputs,
      parsedOutput: null,
      finalDecision: MALFORMED_REFUSAL,
      failureMode,
      latencyMs: Date.now() - started,
    };
  }

  // ---- guardrails ----
  const { final, fired } = applyGuardrails(parsed, signals, action);

  return {
    input: { action, conversationHistory: history },
    signals,
    guardrailsFired: fired,
    prompt,
    rawModelOutput,
    retryRawOutputs,
    parsedOutput: parsed,
    finalDecision: final,
    failureMode,
    latencyMs: Date.now() - started,
  };
}
