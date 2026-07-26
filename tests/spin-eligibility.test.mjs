import assert from "node:assert/strict";
import test from "node:test";
import { getEligibleSpinWords } from "../app/lib/spin.mjs";

const answer = ["l", "u", "c", "k", "y"];
const other = ["s", "m", "i", "l", "e"];
const dictionary = [answer, other];
const reelLetters = new Set(dictionary.flat());
const unlocked = Array(5).fill(null);

test("the protected first pull excludes the answer", () => {
  const candidates = getEligibleSpinWords(
    dictionary,
    reelLetters,
    unlocked,
    new Set(),
    answer.join(""),
  );

  assert.deepEqual(candidates, [other]);
});

test("later pulls include the answer as an ordinary candidate", () => {
  const candidates = getEligibleSpinWords(
    dictionary,
    reelLetters,
    unlocked,
    new Set(),
    null,
  );

  assert.deepEqual(candidates, [answer, other]);
});

test("landed-word memory naturally increases the answer's odds", () => {
  const candidates = getEligibleSpinWords(
    dictionary,
    reelLetters,
    unlocked,
    new Set([other.join("")]),
    null,
  );

  assert.deepEqual(candidates, [answer]);
});
