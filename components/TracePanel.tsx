"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// Note on Base UI's Tooltip: TooltipTrigger renders a <button> by default and
// there is no asChild prop (unlike Radix). We use the trigger directly as our
// info dot, styling the button to look like a tiny circle.
import { DecisionCard } from "./DecisionCard";
import type {
  ActionDescriptor,
  ComputedSignals,
  GuardrailFired,
  Message,
  Trace,
} from "@/lib/types";
import {
  booleanSignalTone,
  enumSignalTone,
  pillClasses,
  signalExplanations,
} from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

type Props = { trace: Trace };

// ---------- small shared bits ----------

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 text-left">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <span className="text-xs text-slate-500">{subtitle}</span>
    </div>
  );
}

function InfoDot({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500 hover:bg-slate-100"
      >
        i
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-[12px] leading-relaxed">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "amber" | "red" | "slate";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        pillClasses(tone),
      )}
    >
      {children}
    </span>
  );
}

// ---------- Section 1: Input ----------

function InputSection({
  action,
  history,
}: {
  action: ActionDescriptor;
  history: Message[];
}) {
  const sorted = history.slice().sort((a, b) => b.minutesAgo - a.minutesAgo);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Proposed action
        </div>
        <div className="mb-3 text-sm text-slate-900">{action.summary}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div>
            <div className="text-slate-500">Category</div>
            <div className="font-mono text-slate-900">{action.category}</div>
          </div>
          <div>
            <div className="text-slate-500">Reversibility</div>
            <Pill
              tone={enumSignalTone.reversibility[action.reversibility]}
            >
              {action.reversibility}
            </Pill>
          </div>
          <div>
            <div className="text-slate-500">External party</div>
            <Pill tone={action.external_party ? "red" : "slate"}>
              {action.external_party ? "yes" : "no"}
            </Pill>
          </div>
          <div>
            <div className="text-slate-500">Financial amount</div>
            <div className="font-mono text-slate-900">
              {action.financial_amount === null
                ? "—"
                : `$${action.financial_amount.toLocaleString()}`}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Time sensitivity</div>
            <Pill tone={enumSignalTone.time_sensitivity[action.time_sensitivity]}>
              {action.time_sensitivity}
            </Pill>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Conversation history
        </div>
        {sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No prior messages.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((m, i) => {
              const isUser = m.role === "user";
              const isExternal = m.source && m.source !== "direct";
              return (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col",
                    isUser ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px]",
                      isUser
                        ? "rounded-br-sm bg-slate-900 text-white"
                        : "rounded-bl-sm bg-slate-100 text-slate-900",
                      isExternal &&
                        "border border-dashed border-rose-300 bg-rose-50 text-rose-900",
                    )}
                  >
                    {m.content}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {isUser ? "User" : "alfred_"} · {m.minutesAgo}m ago
                    {isExternal ? ` · ${m.source}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Section 2: Signals ----------

function SignalsSection({ signals }: { signals: ComputedSignals }) {
  const rows: Array<{
    key: keyof ComputedSignals;
    label: string;
    render: React.ReactNode;
  }> = [
    {
      key: "category",
      label: "category",
      render: <span className="font-mono text-[12px]">{signals.category}</span>,
    },
    {
      key: "reversibility",
      label: "reversibility",
      render: (
        <Pill tone={enumSignalTone.reversibility[signals.reversibility]}>
          {signals.reversibility}
        </Pill>
      ),
    },
    {
      key: "external_party",
      label: "external_party",
      render: (
        <Pill
          tone={
            signals.external_party
              ? booleanSignalTone.external_party === "risky-true"
                ? "red"
                : "green"
              : "slate"
          }
        >
          {String(signals.external_party)}
        </Pill>
      ),
    },
    {
      key: "financial_amount",
      label: "financial_amount",
      render: (
        <span className="font-mono text-[12px]">
          {signals.financial_amount === null
            ? "null"
            : `$${signals.financial_amount.toLocaleString()}`}
        </span>
      ),
    },
    {
      key: "time_sensitivity",
      label: "time_sensitivity",
      render: (
        <Pill tone={enumSignalTone.time_sensitivity[signals.time_sensitivity]}>
          {signals.time_sensitivity}
        </Pill>
      ),
    },
    {
      key: "recent_directive_override",
      label: "recent_directive_override",
      render: (
        <Pill tone={signals.recent_directive_override ? "red" : "slate"}>
          {String(signals.recent_directive_override)}
        </Pill>
      ),
    },
    {
      key: "turns_since_user_confirmation",
      label: "turns_since_user_confirmation",
      render: (
        <span className="font-mono text-[12px]">
          {signals.turns_since_user_confirmation}
        </span>
      ),
    },
    {
      key: "ambiguous_pronouns",
      label: "ambiguous_pronouns",
      render:
        signals.ambiguous_pronouns.length === 0 ? (
          <Pill tone="slate">none</Pill>
        ) : (
          <div className="flex flex-wrap gap-1">
            {signals.ambiguous_pronouns.map((p) => (
              <Pill key={p} tone="amber">
                &ldquo;{p}&rdquo;
              </Pill>
            ))}
          </div>
        ),
    },
    {
      key: "pending_clarification",
      label: "pending_clarification",
      render: (
        <Pill tone={signals.pending_clarification ? "red" : "slate"}>
          {String(signals.pending_clarification)}
        </Pill>
      ),
    },
    {
      key: "user_state",
      label: "user_state",
      render: (
        <Pill tone={enumSignalTone.user_state[signals.user_state]}>
          {signals.user_state}
        </Pill>
      ),
    },
    {
      key: "matches_standing_rule",
      label: "matches_standing_rule",
      // Green-when-true — this is the one signal where "fires" means "user
      // pre-authorized silence," which is a safer, not riskier, state.
      render: (
        <Pill tone={signals.matches_standing_rule ? "green" : "slate"}>
          {String(signals.matches_standing_rule)}
        </Pill>
      ),
    },
    {
      key: "injection_detected",
      label: "injection_detected",
      render: (
        <Pill tone={signals.injection_detected ? "red" : "slate"}>
          {String(signals.injection_detected)}
        </Pill>
      ),
    },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.key}
              className={cn(i % 2 === 1 && "bg-slate-50/50")}
            >
              <td className="w-1/2 px-3 py-2 align-top font-mono text-slate-700">
                <span className="inline-flex items-center">
                  {r.label}
                  <InfoDot label={signalExplanations[r.label] ?? ""} />
                </span>
              </td>
              <td className="px-3 py-2 align-top">{r.render}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Section 3: Guardrails ----------

function GuardrailsSection({ fired }: { fired: GuardrailFired[] }) {
  if (fired.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600">
        No guardrails triggered. Decision deferred to model.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {fired.map((g) => (
        <div
          key={g.name}
          className="rounded-md border border-amber-200 bg-amber-50/60 p-3"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-200/70 px-1.5 py-0.5 font-mono text-[11px] text-amber-900">
              {g.name}
            </span>
            <span className="text-[11px] text-amber-900">
              {g.modelDecision} → <b>{g.forcedDecision}</b>
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-amber-950">{g.explanation}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- Section 4: Prompt ----------

function PromptSection({
  system,
  user,
}: {
  system: string;
  user: string;
}) {
  const [copied, setCopied] = useState<"system" | "user" | null>(null);

  const Copy = ({
    text,
    tag,
  }: {
    text: string;
    tag: "system" | "user";
  }) => (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(tag);
        setTimeout(() => setCopied(null), 1500);
      }}
      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied === tag ? "Copied" : "Copy"}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-slate-200 bg-slate-950 p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            System
          </span>
          <Copy text={system} tag="system" />
        </div>
        <pre className="max-h-60 overflow-auto px-3 py-2 text-[11.5px] leading-relaxed text-slate-200 whitespace-pre-wrap">
          {system}
        </pre>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-950 p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            User
          </span>
          <Copy text={user} tag="user" />
        </div>
        <pre className="max-h-80 overflow-auto px-3 py-2 text-[11.5px] leading-relaxed text-slate-200 whitespace-pre-wrap">
          {user}
        </pre>
      </div>
    </div>
  );
}

// ---------- Section 5: Model output ----------

function ModelOutputSection({ trace }: { trace: Trace }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-slate-200 bg-slate-950 overflow-hidden">
        <div className="border-b border-slate-800 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Raw model output
        </div>
        <pre className="max-h-48 overflow-auto px-3 py-2 text-[11.5px] leading-relaxed text-slate-200 whitespace-pre-wrap">
          {trace.rawModelOutput || "(empty)"}
        </pre>
      </div>

      {trace.retryRawOutputs.length > 0 && (
        <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-rose-800">
            Initial output failed Zod validation — retry attempt
          </div>
          {trace.retryRawOutputs.map((r, i) => (
            <pre
              key={i}
              className="mt-2 max-h-40 overflow-auto rounded border border-rose-200 bg-white p-2 text-[11.5px] leading-relaxed text-rose-950 whitespace-pre-wrap"
            >
              {r}
            </pre>
          ))}
        </div>
      )}

      {trace.failureMode && (
        <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 text-[13px] text-rose-900">
          <b>Failure mode:</b> {trace.failureMode}. Returning a safe refuse.
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Final decision (post-guardrails)
        </div>
        <DecisionCard
          output={trace.finalDecision}
          latencyMs={trace.latencyMs}
        />
      </div>
    </div>
  );
}

// ---------- TracePanel ----------

// Base UI Accordion is multi-open by default; defaultValue is an array of
// AccordionItem values to pre-open.
export function TracePanel({ trace }: Props) {
  return (
    <Accordion defaultValue={["input", "signals"]} className="w-full">
      <AccordionItem value="input">
        <AccordionTrigger>
          <SectionHeader
            title="1. Input"
            subtitle="The action alfred_ is considering and the conversation it saw."
          />
        </AccordionTrigger>
        <AccordionContent>
          <InputSection
            action={trace.input.action}
            history={trace.input.conversationHistory}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="signals">
        <AccordionTrigger>
          <SectionHeader
            title="2. Computed signals"
            subtitle="Objective, code-computed facts. Hover any row for why it matters."
          />
        </AccordionTrigger>
        <AccordionContent>
          <SignalsSection signals={trace.signals} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="guardrails">
        <AccordionTrigger>
          <SectionHeader
            title="3. Guardrails"
            subtitle="Deterministic rules that can override the model."
          />
        </AccordionTrigger>
        <AccordionContent>
          <GuardrailsSection fired={trace.guardrailsFired} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="prompt">
        <AccordionTrigger>
          <SectionHeader
            title="4. Prompt sent to model"
            subtitle="Fully interpolated — no placeholders."
          />
        </AccordionTrigger>
        <AccordionContent>
          <PromptSection
            system={trace.prompt.system}
            user={trace.prompt.user}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="output">
        <AccordionTrigger>
          <SectionHeader
            title="5. Model output"
            subtitle="Raw response, retry (if any), and the final decision after guardrails."
          />
        </AccordionTrigger>
        <AccordionContent>
          <ModelOutputSection trace={trace} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
