import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";

const PORT = 4173;

async function waitForServer(url, tries = 60) {
  for (; tries > 0; tries -= 1) {
    try {
      const response = await fetch(url, { headers: { accept: "text/html" } });
      if (response.ok) return response;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("next start did not come up in time");
}

test("server-renders the Chathuraksharam page", async () => {
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: "ignore",
    detached: false,
  });

  try {
    const response = await waitForServer(`http://127.0.0.1:${PORT}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, /<html lang="ml"/i);
    assert.match(html, /<title>Chathuraksharam<\/title>/i);
    assert.match(html, /Chathuraksharam/);
    assert.match(html, /5×5/);
    assert.match(html, /five tries/);
    assert.match(html, /Malayalam letter reels/);
    assert.match(html, /Pull the lever/);
    // Every keyboard aksharam must appear on the reels (spot-check a few).
    assert.match(html, /വു/);
    assert.match(html, /ങ്ങ/);
    assert.match(html, /സ്സു/);
    assert.match(html, /I am learning Malayalam/);
    assert.match(html, /Learner lookup/);
    assert.match(html, /Manglish sound/);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
  } finally {
    server.kill("SIGTERM");
  }
});
