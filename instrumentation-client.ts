import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// Without a token (e.g. local dev with no .env.local) skip analytics
// entirely instead of letting PostHog log init errors on every load.
if (token) {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}
