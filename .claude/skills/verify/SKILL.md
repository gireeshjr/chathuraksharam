---
name: verify
description: Build, run, and drive the Chathuraksharam game locally to verify changes at the browser surface.
---

# Verifying Chathuraksharam

Single-page Malayalam daily word game — a plain Next.js app (deployed on
Vercel). Surface is a browser GUI — verify by driving it with Playwright,
not by curling HTML.

## Build / run

- Requires Node >= 20.9. If the default node is 18, use:
  `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`
- Dev server: `npm run dev` → http://localhost:3000/ (pass `-- -p 3001` if
  3000 is taken by another app on this machine, which it usually is).
- Repo test gate: `npm test` (next build, boots `next start` on port 4173,
  asserts SSR HTML strings). Keep the strings it asserts on:
  "Chathuraksharam", "5×5", "five tries", "Malayalam letter reels",
  "Pull the lever", "I am learning Malayalam", "Learner lookup",
  "Manglish sound". Describe the game only in its own terms (daily Malayalam
  word puzzle); see the project memory for naming rules that apply to all
  code, copy, comments, and commit messages.
- localStorage keys are `chathuraksharam-state-v1` / `-mode-v1` / `-sound-v1`.

## Driving the game

- Today's answer: replicate `getPuzzleId()` — days since 2026-01-01 **UTC**,
  `WORDS[puzzleId % WORDS.length]` from the bank in `app/page.tsx`. Don't hardcode;
  the machine's UTC day may differ from the local date.
- Reveal takes ~1.8s (staggered tile flips); reel status colors, the result
  modal (`.result-card`), and confetti appear only after it settles.
- Clear state between scenarios: `localStorage.clear()` + reload.
- Watch for Next's dev error overlay; if clicks get intercepted, read the
  overlay text first (usually a hydration mismatch).
- Mobile: 390x844 viewport with touch; input is the slot machine only.
  Check `document.documentElement.scrollWidth` for overflow. `html` must
  keep `overscroll-behavior-y: none` — pull-to-refresh mid-game looked
  like the page "randomly reloading".

## 3D gameplay (slot machine + word drum)

- The ONLY input is the slot machine: five `.reel` buttons + a `.lever` button.
  Click the lever → unlocked reels spin (~2s full speed) and land on weighted-
  random letters (absent-marked letters are rare, present/correct ~3x likely).
  Toggle a reel's `.reel-lock-btn` padlock to lock/unlock; locking all five
  auto-checks after ~1.2s (unlocking inside that window cancels). Reels
  auto-unlock after each reveal.
- Read a reel's current letter from its dial aria-label:
  `Reel N: <letter>, <sound>. …`; locked state from `aria-pressed` on the
  `.reel-lock-btn`.
- Reels are also hand-settable (luck + effort): TAPPING the `.reel-dial`
  opens an inline keyboard callout below the reel bank (`.picker-pop`,
  one `.picker-key` per aksharam with keyboard-state colors; its
  `.picker-caret` points at the targeted reel and slides when another
  reel is tapped; tapping the same reel again closes it). Picking
  snap-rolls the reel to that letter along the shortest path (REEL_SEQ =
  allKeys[(i*11)%35]) and the callout STAYS OPEN for the next reel.
  Dragging the `.reel-dial` vertically still scrolls it with
  snap-to-letter. Locking is a SEPARATE `.reel-lock-btn` padlock
  button on top of each reel (aria `Lock reel N on <letter>` / `Unlock
  reel N`, aria-pressed = locked); the dial itself never toggles locks.
  Tap-vs-dial on the dial is judged by outcome, not a pixel slop: a
  gesture that stays on the same letter and moves less than ~45% of an
  item height opens the picker (so wobbly touch taps land); a drag that
  reaches another letter dials and must NOT open the picker. Locked reels
  refuse picking and drags. To assemble a specific word fast in a test,
  pick each reel's target letter via the keyboard overlay and lock it —
  no luck needed.
- The lever is a pointer gesture (pointerdown grabs with capture, pointerup
  spins; keyboard fires via click detail 0) and has `touch-action: none`,
  so pulling it on mobile must move the lever, never scroll the page.
- Blank-reel regression guard: during a full-speed pull, every
  `.reel-window` payline must always overlap a non-empty `.reel-item`
  (spins loop exactly once — STRIP_COPIES=4 alphabet copies of runway,
  reels resting in copy 1; keep strips short, tall composited layers
  caused mobile Safari memory-pressure page reloads).
- Reel 1 starts ON the answer's first aksharam and pre-locked (the hint
  gives it away anyway); it re-locks at the start of every round, stays
  unlockable, and never spins while locked. Only 4 locks are needed to
  trigger the auto-check. After game over the drum stays on the final
  guessed face (it must not roll to an empty face).
- Lever pulls land on GUESS_WORDS dictionary entries (answers + extras in
  page.tsx) that match every locked reel and aren't already guessed. Pulls
  also avoid words the lever already landed on since page load — a word may
  repeat only after every other fitting word has been shown; when
  no word fits, it falls back to weighted-random letters and the status
  says "free spin". To verify, replicate the dictionary in the test and
  assert each landing is a member matching the locks. New dictionary words
  must be real, kid-safe Malayalam — the build throws if one isn't exactly
  5 keyboard aksharams.
- The hint card shows the meaning clue only (no letter tiles — the first
  letter lives on the pre-locked reel).
- The board is a pentagonal drum (`.drum-inner`); face i is front when its
  inline transform is `rotateX(<i*72>deg)`. After a non-final reveal it must
  roll +72°. Drag it vertically or click `.drum-dot` buttons to change faces.
- Locked letters preview live on the drum's active face (position-mapped).
- Test assertions now expect "Malayalam letter reels" and "Pull the lever"
  instead of the old keyboard strings.
- NEVER add `setPointerCapture` to a container whose children are buttons:
  capture retargets click events to the container (this broke the old globe).
