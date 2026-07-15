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
    // Session replay serialises DOM snapshots in the page and flushes
    // every ~30s — the same cadence as the mid-game page reloads seen on
    // phones (renderer memory kills auto-reload there). Recording stays
    // off until the reloads are confirmed gone; events still flow.
    disable_session_recording: true,
  });

  // Lifecycle probe: pagehide marks a clean exit, so finding the marker
  // still "open" on the next load means the previous pageview died
  // without unloading — a renderer crash or memory kill, not navigation.
  try {
    const KEY = "chathuraksharam-lifecycle-v1";
    const prior = window.localStorage.getItem(KEY);
    if (prior) {
      posthog.capture("previous_pageview_ended", {
        clean_exit: prior === "closed",
      });
    }
    window.localStorage.setItem(KEY, "open");
    window.addEventListener("pagehide", () => {
      window.localStorage.setItem(KEY, "closed");
    });
  } catch {
    // localStorage unavailable (private browsing) — skip the probe.
  }
}
