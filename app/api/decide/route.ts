import { NextResponse } from "next/server";
import { decide } from "@/lib/decide";
import { decideRequestSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = decideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request shape", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { action, conversationHistory, simulateMalformedOutput } = parsed.data;

  // Malformed simulation never calls the model, so skip the key check to
  // keep the failure-mode demo usable without an API key.
  if (!simulateMalformedOutput && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Server is missing ANTHROPIC_API_KEY. Set it in .env.local (dev) or Vercel project settings (prod).",
      },
      { status: 500 },
    );
  }
  const trace = await decide(action, conversationHistory, {
    simulateMalformedOutput,
  });
  return NextResponse.json(trace);
}
