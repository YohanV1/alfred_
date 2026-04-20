"use client";

// An iMessage/SMS-style bubble. alfred_ lives in text messages, so the whole
// product identity hinges on this looking like an actual thread. The bubble
// has:
//   - a sender label above (when provided)
//   - a rounded, gray bubble with a small CSS-drawn tail
//   - a subtle timestamp below
//
// Side controls alignment: "right" for outgoing (alfred_'s voice in our
// reviewer-facing UI) and "left" for incoming (the end user's voice).

import { cn } from "@/lib/utils";

type Props = {
  side: "left" | "right";
  sender?: string;
  timestamp?: string;
  tone?: "alfred" | "user" | "external";
  children: React.ReactNode;
  className?: string;
};

export function SmsBubble({
  side,
  sender,
  timestamp,
  tone = side === "right" ? "alfred" : "user",
  children,
  className,
}: Props) {
  const palette =
    tone === "alfred"
      ? // Gray "from alfred_" bubble, iMessage-incoming style.
        "bg-slate-200 text-slate-900"
      : tone === "external"
        ? // Dashed border when the content came from outside the thread —
          // email bodies, webhooks. Red-ish so reviewers see it instantly.
          "border border-dashed border-rose-300 bg-rose-50 text-rose-900"
        : // The user's own voice — classic iMessage blue-ish, slate here
          // since we're avoiding brand colors.
          "bg-slate-900 text-white";

  return (
    <div
      className={cn(
        "flex flex-col",
        side === "right" ? "items-end" : "items-start",
        className,
      )}
    >
      {sender && (
        <span className="mb-0.5 text-[10px] font-medium text-slate-500">
          {sender}
        </span>
      )}
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug whitespace-pre-wrap",
          side === "right" ? "rounded-br-sm" : "rounded-bl-sm",
          palette,
        )}
      >
        {children}
        {/* Tail — a tiny square rotated 45° at the bottom corner. */}
        <span
          aria-hidden
          className={cn(
            "absolute bottom-0 h-2 w-2 rotate-45",
            side === "right"
              ? "right-[-2px] translate-y-[2px]"
              : "left-[-2px] translate-y-[2px]",
            tone === "alfred"
              ? "bg-slate-200"
              : tone === "external"
                ? "bg-rose-50 border border-dashed border-rose-300"
                : "bg-slate-900",
          )}
        />
      </div>
      {timestamp && (
        <span className="mt-1 text-[10px] text-slate-400">{timestamp}</span>
      )}
    </div>
  );
}
