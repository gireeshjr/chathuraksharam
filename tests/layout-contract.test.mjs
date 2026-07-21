import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the game column and reels have content-independent widths", async () => {
  const [css, page] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(
    css,
    /\.game-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    css,
    /\.tilt-stage\s*{[^}]*max-width:\s*36rem[^}]*width:\s*100%/s,
  );
  assert.match(css, /\.machine-body\s*{[^}]*width:\s*100%/s);
  assert.match(
    css,
    /\.reel-bank\s*{[^}]*flex:\s*1 1 470px[^}]*max-width:\s*470px/s,
  );
  assert.doesNotMatch(page, /game-layout[^"\n]*justify-center/);
});
