# alfred_ · Execution Decision Layer

**Live URL: _(add after Vercel deploy)_**

A 6-hour take-home prototype of the decision layer that sits between alfred_ and any action it might take on a user's behalf. Given a proposed action and the conversation context, it picks one of five decisions — **execute silently, execute and notify, confirm, clarify, refuse** — and explains why.

## How to run

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev        # http://localhost:3000
```

For production: set `ANTHROPIC_API_KEY` in Vercel project settings, same var name.

## Architecture

```
┌────────────────────┐     ┌────────────────────────────────────────────────┐
│                    │     │  /api/decide                                    │
│  app/page.tsx      │────▶│                                                 │
│  (2-pane UI)       │     │   lib/signals.ts  ──►  ComputedSignals (code)  │
│                    │     │          │                                      │
│                    │     │          ▼                                      │
│                    │     │   lib/prompt.ts   ──►  system + user prompt    │
│                    │     │          │                                      │
│                    │     │          ▼                                      │
│                    │     │   Anthropic SDK (claude-sonnet-4-5, 20s race)  │
│                    │     │          │                                      │
│                    │     │          ▼                                      │
│                    │     │   Zod parse (+ 1 retry on malformed)           │
│                    │     │          │                                      │
│                    │     │          ▼                                      │
│                    │     │   Deterministic guardrails (can override)      │
│                    │     │          │                                      │
│                    │◀────│          ▼ Trace { signals, prompt, raw, final}│
└────────────────────┘     └────────────────────────────────────────────────┘
```

**The central design choice is the split between what code computes and what the model decides.** Code produces objective, typed *signals* about the action and the conversation. The model reads the signals (not the raw state) and picks a decision. Deterministic guardrails post-process the model's answer so that fatal missteps are impossible even if the model chooses unwisely.

## Signals used, and why

**Action-intrinsic** (straight from the action descriptor):

| Signal | Why |
|---|---|
| `category` | Lookup key for category-specific policy. |
| `reversibility` | Irreversible actions need a higher bar — and feed the first guardrail. |
| `external_party` | Touching other people's inboxes/calendars raises the bar. |
| `financial_amount` | Any money movement is worth confirming; size matters. |
| `time_sensitivity` | Imminent reversible actions can justify silent execute. |

**Context-derived** (computed from conversation history):

| Signal | Why |
|---|---|
| `recent_directive_override` | The "Yep, send it" trap — user countermanded themselves. Drives guardrail #2. |
| `turns_since_user_confirmation` | Acting on an old mandate is riskier than acting on a fresh one. |
| `ambiguous_pronouns` | "Add that to it" with two possible referents → clarify. |
| `pending_clarification` | alfred_ has an open question. Drives guardrail #3 (must stay in clarify). |
| `user_state` | Active users can be notified cheaply; idle users need restraint. |
| `matches_standing_rule` | The user previously told alfred_ "auto-do X, don't ping me." Drives a *downgrading* guardrail: execute_and_notify → execute_silently. |
| `injection_detected` | Regex over external-sourced content for known injection phrases. Never let injected text drive an action. |

`recent_directive_override`, `ambiguous_pronouns`, and `injection_detected` are the signals most likely to have subtle bugs **and** the ones the highest-stakes scenarios (stale-affirmative, pronoun-trap, injection) depend on. They have real test coverage in `lib/__tests__/signals.test.ts` (ten cases, run with `npm test`) — because these three are exactly the ones where a silent regression would embarrass the reviewer.

## Code vs model

| Concern | Owner | Why |
|---|---|---|
| Compute objective signals | **Code** | Same input → same output. Cheap, testable, auditable. |
| Detect prompt injection in external content | **Code** | The model is the victim of injection; detecting it is code's job. |
| Choose a decision given signals, history, and policy | **Model** | Judgment under ambiguity is the whole point of having an LLM here. |
| Write rationale + user-facing message | **Model** | Natural-language phrasing is the model's strength. |
| Enforce non-negotiable safety rules | **Code** | See below. |
| Validate output shape | **Code** | Zod. One retry on failure, then refuse. |

## Deterministic guardrails

These run on the model's output and can override it. Every override is logged in the trace with the rule name and the before → after decision.

1. `irreversible_external_or_financial` — irreversible + (external party OR any `financial_amount`). Floor at **confirm**. Silent execute is blocked; the model can still pick clarify or refuse on its own.
2. `recent_directive_override` — the stale-affirmative trap. Floor at **confirm** (model may upgrade to clarify). Written as `max(model_decision, confirm)`.
3. `pending_clarification` — force **clarify**. An unanswered question trumps any new action.
4. `standing_rule_silent` — `matches_standing_rule=true` AND model chose `execute_and_notify` → downgrade to **execute_silently**. The ONE guardrail that lowers severity: the user explicitly pre-authorized silence for this class of action, so notifying them would violate their own instruction. Narrow-scoped: only touches the silent↔notify pair. Any stricter decision the model reached on its own (confirm/clarify/refuse) is left alone — safety concerns always beat a standing rule.

Injection is handled by its own two branches (read-only → upgrade to execute_and_notify with flag; mutating → force refuse) inside the same guardrail pipeline. The split exists because the right behavior under injection genuinely depends on whether the user-requested action mutates state: summarizing an injection-bearing email is fine (flag it in `user_message`), but acting on the injected instruction is not.

## Prompt design

See [`lib/prompt.ts`](./lib/prompt.ts). The system prompt (≈350 words) lists the five decisions, restates the challenge doc's policy boundaries verbatim, names the specific signals the model should weigh, and prescribes the JSON-only output format. The user prompt is a fully-interpolated block — **Proposed Action**, **Computed Signals**, **Conversation History** — with zero template variables visible. The trace shows exactly the string the model saw, not a template, because debuggability is the point.

## Failure modes

1. **Model timeout** (20s race via `Promise.race`). Return `refuse` with a fixed rationale; trace marks `failureMode: "timeout"`.
2. **Malformed output** (Zod fails). Retry once with a stricter JSON-only reminder system prompt. Second failure → `refuse`; trace captures both raw outputs so the reviewer can see the retry attempt.
3. **Missing critical context** (empty `action.category`). Short-circuit to `clarify` before calling the model.

**(2) is demoable in the UI** — toggle "Simulate malformed model output" and watch the trace's section 5 render the junk first response, the junk retry, and the safe refuse that lands.

## How this evolves as alfred_ gains riskier tools

Three ideas I'd actually invest in, developed rather than listed:

1. **Per-user trust calibration.** The silent-execute threshold isn't universal — a user who never overrides alfred_ has earned a higher silent ceiling; a user who frequently countermands themselves should see more confirms. Concretely: log the final decision and the user's response (did they proceed, correct, undo?), decay the signal, and let the trust score shift the `confirm`/`execute_and_notify` boundary ±1 category. Never below the deterministic guardrail floor.

2. **Shadow mode for new tools.** When alfred_ gains a new irreversible capability (refunds, sending email to external domains, posting to Slack), run the decision layer in *shadow* for the first N real invocations. alfred_ decides silently-or-notify in shadow but never executes; instead the predicted decision is logged and surfaced in a weekly review UI. Only after the decisions look sane does the tool graduate to live execution. Costs us nothing, saves us from a category of incidents where the tool itself is fine but the policy coverage hasn't caught up.

3. **Reversal primitive.** For soft-reversible actions taken without confirmation, attach a silent 60-second "alfred_, undo" window. The reply channel is already open (alfred_ lives in SMS), and reversing a just-sent reminder or just-added calendar event is almost free. The trust calibration above compounds with this: the fact that undo exists is itself a reason to loosen the silent threshold. This is the rare feature where shipping two things together makes each one more valuable.

## What I'd build next with six more months

- **Eval harness + regression suite.** `acceptableDecisions` on each scenario is already the schema; a CI job that runs all scenarios against the current prompt and flags drift would catch model-update regressions before they ship. Trade: needs a budget line for API calls.
- **Per-category policy layer.** Right now the policy lives in one prompt. At scale you want `send_email` and `cancel_subscription` to have their own typed config (e.g., confirm above $X, refuse above $Y) composed into the prompt. Trade: more structure, less flexibility for the model to use judgment.
- **Structured audit log.** Every decision, every guardrail override, every retry — persisted and queryable. This is the substrate for the trust calibration and for answering "why did alfred_ do X?" after the fact. Trade: adds a database to an otherwise stateless service, and "did we do the right thing" is a hard query to formalize.

## What I chose not to build and why

- **Auth / users / persistence.** The decision service is pure — action + history in, decision out. Adding a DB for a 6-hour prototype signals overreach, not thoroughness.
- **Streaming decisions.** Would improve perceived latency but complicates guardrail post-processing (can't guardrail a partial decision). Not worth it here.
- **Multi-model support.** One model, one prompt. Choosing between models is a later optimization.
- **Fancy landing page / animations / branding.** Kept the aesthetic deliberately close to an internal tool: one accent family, no gradients, no emoji. The app should feel like `psql` with manners, not like a product launch.

## One design choice I'd defend

**The counterfactual panel only flips code-side facts, and will honestly say "no flip would change this" when the model itself drove the outcome.**

The easy version of "What would change this decision?" is to ask the LLM to imagine alternatives. It always produces something. It usually reads well. It's also fabrication — the "alternative" the model narrates isn't the same graph we evaluated, so the user can't trust it to predict a real re-run.

I went the other way: hold the model output *constant*, flip one signal at a time, and re-run the *deterministic* guardrails. That means the panel shows only what we can actually prove. When the model judged an action risky enough to confirm and no guardrail was involved, no code-side flip changes the answer — so the panel says exactly that, instead of inventing a flip that would supposedly have moved the model.

The cost: the panel is empty on scenarios where the model, not the guardrails, decided. I think that's the right trade. An empty counterfactual panel is a true statement about the decision's provenance — it tells the reviewer *the model owns this one, not the rules* — and that's more useful than a confident-sounding lie.
