import { z } from "zod";

// The model must return JSON matching this shape. We parse defensively
// (stripping code fences) before handing raw text to Zod.
export const decisionOutputSchema = z.object({
  decision: z.enum([
    "execute_silently",
    "execute_and_notify",
    "confirm",
    "clarify",
    "refuse",
  ]),
  rationale: z.string().min(1),
  user_message: z.string().nullable(),
  internal_notes: z.string().min(1),
});

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  minutesAgo: z.number().min(0),
  source: z
    .enum(["direct", "external_email_body", "external_other"])
    .optional(),
});

export const actionSchema = z.object({
  category: z.string().min(1),
  summary: z.string().min(1),
  reversibility: z.enum(["reversible", "soft_reversible", "irreversible"]),
  external_party: z.boolean(),
  financial_amount: z.number().nullable(),
  time_sensitivity: z.enum(["none", "same_day", "imminent"]),
  read_only: z.boolean(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const decideRequestSchema = z.object({
  action: actionSchema,
  conversationHistory: z.array(messageSchema),
  simulateMalformedOutput: z.boolean().optional(),
});
