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
  Check `document.documentElement.scrollWidth` for overflow.

## 3D gameplay (slot machine + word drum)

- The ONLY input is the slot machine: five `.reel` buttons + a `.lever` button.
  Click the lever → unlocked reels spin (~2s full speed) and land on weighted-
  random letters (absent-marked letters are rare, present/correct ~3x likely).
  Tap a reel to lock/unlock; locking all five auto-checks after ~1.2s
  (unlocking inside that window cancels). Locking is a no-op before the first
  pull. Reels auto-unlock after each reveal.
- Read a reel's current letter from its aria-label: `Reel N: <letter>, <sound>. …`;
  locked state from `aria-pressed`.
- Reels are also hand-dialable (luck + effort): `Reel N next letter` /
  `Reel N previous letter` buttons nudge one step through the strip
  (REEL_SEQ = allKeys[(i*11)%35]); dragging the `.reel-dial` vertically
  scrolls it with snap-to-letter. Tap-vs-dial is judged by outcome, not a
  pixel slop: a gesture that stays on the same letter and moves less than
  ~45% of an item height toggles the lock (so wobbly touch taps land); a
  drag that reaches another letter dials and must NOT toggle the lock.
  Locked reels refuse nudges and drags. To assemble a specific word fast in
  a test, dial each reel to its target letter and lock it — no luck needed.
- The lever is a pointer gesture (pointerdown grabs with capture, pointerup
  spins; keyboard fires via click detail 0) and has `touch-action: none`,
  so pulling it on mobile must move the lever, never scroll the page.
- Blank-reel regression guard: during a full-speed pull, every
  `.reel-window` payline must always overlap a non-empty `.reel-item`
  (spins loop at most twice — STRIP_COPIES=6 alphabet copies of runway;
  keep strips short, they are huge composited layers on mobile).
- Reel 1 starts ON the answer's first aksharam and pre-locked (the hint
  gives it away anyway); it re-locks at the start of every round, stays
  unlockable, and never spins while locked. Only 4 locks are needed to
  trigger the auto-check. After game over the drum stays on the final
  guessed face (it must not roll to an empty face).
- Lever pulls land on GUESS_WORDS dictionary entries (answers + extras in
  page.tsx) that match every locked reel and aren't already guessed; when
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
