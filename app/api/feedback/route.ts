import { NextRequest } from "next/server";

const TYPES = new Set(["suggestion", "problem", "question"]);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestsByAddress = new Map<string, number[]>();

type FeedbackBody = {
  type?: unknown;
  message?: unknown;
  email?: unknown;
  website?: unknown;
  openedAt?: unknown;
  context?: unknown;
};

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function isEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRateLimited(address: string) {
  const now = Date.now();
  const recent = (requestsByAddress.get(address) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  recent.push(now);
  requestsByAddress.set(address, recent);
  return recent.length > MAX_REQUESTS;
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 12_000) {
    return Response.json({ error: "Feedback is too large." }, { status: 413 });
  }

  let body: FeedbackBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid feedback." }, { status: 400 });
  }

  // Bots commonly fill hidden fields. Return success without sending so the
  // trap does not reveal itself.
  if (clean(body.website, 100)) return Response.json({ ok: true });

  const openedAt = typeof body.openedAt === "number" ? body.openedAt : 0;
  if (!openedAt || Date.now() - openedAt < 1_500) {
    return Response.json({ error: "Please try again." }, { status: 400 });
  }

  const type = clean(body.type, 20);
  const message = clean(body.message, 2_000);
  const email = clean(body.email, 254);
  if (!TYPES.has(type) || message.length < 10 || !isEmail(email)) {
    return Response.json(
      { error: "Please check the feedback form." },
      { status: 400 },
    );
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  if (isRateLimited(address)) {
    return Response.json(
      { error: "Too many messages. Please try again later." },
      { status: 429 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!apiKey || !to) {
    console.error("Feedback email environment variables are not configured.");
    return Response.json(
      { error: "Feedback is temporarily unavailable." },
      { status: 503 },
    );
  }

  const context = body.context && typeof body.context === "object"
    ? body.context as Record<string, unknown>
    : {};
  const contextLines = ["language", "category", "puzzle", "viewport"]
    .map((key) => `${key}: ${clean(context[key], 100) || "—"}`)
    .join("\n");
  const text = [
    `Type: ${type}`,
    `Reply email: ${email || "Not provided"}`,
    "",
    message,
    "",
    "Game context",
    contextLines,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Chathuraksharam Feedback <onboarding@resend.dev>",
      to: [to],
      subject: `Chathuraksharam ${type}`,
      text,
      ...(email ? { reply_to: email } : {}),
    }),
  });

  if (!response.ok) {
    console.error("Resend rejected a feedback email.", response.status);
    return Response.json(
      { error: "We couldn't send that message. Please try again." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
