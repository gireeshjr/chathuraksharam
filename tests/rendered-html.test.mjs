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

test("server-renders the default English game", async () => {
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: "ignore",
    detached: false,
  });

  try {
    const response = await waitForServer(`http://127.0.0.1:${PORT}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

    const html = await response.text();
    assert.match(html, /<html dir="ltr" lang="en"/i);
    assert.match(html, /<title>Chathuraksharam — Word Square<\/title>/i);
    assert.match(html, /Chathuraksharam — Word Square/);
    assert.match(html, /English/);
    assert.match(html, /Everyday/);
    assert.match(html, /class="stream-trigger/);
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /English letter reels/);
    assert.match(html, /Pull the lever/);
    assert.match(html, /A fruit that can be red, green, or gold/);
    assert.doesNotMatch(html, /How to play|Learner lookup|learning Malayalam|Manglish sound/);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
  } finally {
    server.kill("SIGTERM");
  }
});
