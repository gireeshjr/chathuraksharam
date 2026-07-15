import posthog from "posthog-js";

// The pre-2026-07-13 host registered a service worker on this domain. Its
// update check now 404s, so browsers keep the stale worker forever, and its
// refresh cycle reloads the page mid-game (~every 30s). Evict it and its
// caches; once no worker controls the page, this is a cheap no-op.
if (typeof window !== "undefined") {
  navigator.serviceWorker
    ?.getRegistrations?.()
    .then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    })
    .catch(() => {});
  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => keys.forEach((key) => caches.delete(key)))
      .catch(() => {});
  }
}

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
