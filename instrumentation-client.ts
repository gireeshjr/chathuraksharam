import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// Analytics and session replay run only in production builds served from a
// real domain. Local dev, `next start` on this machine, and LAN previews
// never capture — no token means no init, and no init means no replay.
const isProductionBuild = process.env.NODE_ENV === "production";
const isLocalHost =
  typeof window !== "undefined" &&
  /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(
    window.location.hostname,
  );

if (token && isProductionBuild && !isLocalHost) {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
  });
}
