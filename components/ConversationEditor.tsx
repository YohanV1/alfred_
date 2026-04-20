"use client";

// Editable conversation history. The reviewer will want to probe: "what if
// the user said X instead?" — so every message bubble is inline-editable.
// On blur (or Enter), the change is committed back to parent state, and
// the next Decide click picks it up.
//
// Deliberately minimal: no add/remove, no role toggling, no timestamp edits.
// Just text.

import type { Message } from "@/lib/types";
import { SmsBubble } from "./SmsBubble";
import { useEffect, useRef } from "react";

type Props = {
  messages: Message[];
  onChange: (next: Message[]) => void;
};

export function ConversationEditor({ messages, onChange }: Props) {
  // Display oldest first.
  const sorted = messages
    .map((m, i) => ({ ...m, _i: i }))
    .sort((a, b) => b.minutesAgo - a.minutesAgo);

  function updateContent(originalIndex: number, next: string) {
    const clone = messages.slice();
    clone[originalIndex] = { ...clone[originalIndex], content: next };
    onChange(clone);
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
        No prior messages.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((m) => {
        const isUser = m.role === "user";
        const isExternal = m.source && m.source !== "direct";
        return (
          <EditableBubble
            key={m._i}
            side={isUser ? "right" : "left"}
            sender={
              isExternal
                ? `external · ${m.source}`
                : isUser
                  ? "User"
                  : "alfred_"
            }
            timestamp={`${m.minutesAgo}m ago`}
            tone={isExternal ? "external" : isUser ? "user" : "alfred"}
            value={m.content}
            onCommit={(next) => updateContent(m._i, next)}
          />
        );
      })}
      <p className="text-[11px] text-slate-400">
        Click any bubble to edit. Blur (or Tab/Enter) commits. Decide re-runs
        with the edited history.
      </p>
    </div>
  );
}

function EditableBubble({
  side,
  sender,
  timestamp,
  tone,
  value,
  onCommit,
}: {
  side: "left" | "right";
  sender: string;
  timestamp: string;
  tone: "alfred" | "user" | "external";
  value: string;
  onCommit: (next: string) => void;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  // Sync DOM text when the value prop changes externally (e.g. scenario switch).
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    <SmsBubble side={side} sender={sender} timestamp={timestamp} tone={tone}>
      <span
        ref={ref}
        role="textbox"
        aria-label={`Edit message from ${sender}`}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={(e) => onCommit((e.currentTarget.textContent ?? "").trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget as HTMLSpanElement).blur();
          }
        }}
        className="outline-none focus:ring-1 focus:ring-offset-2 focus:ring-slate-400 rounded-[3px]"
      >
        {value}
      </span>
    </SmsBubble>
  );
}
