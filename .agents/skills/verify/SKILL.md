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
  Click the lever → all reels spin (~2s full speed) and land on a dictionary
  word other than the answer. The single `.machine-lock` button freezes all
  five dials and auto-checks after ~1.2s. It shows a disabled “Checking…” state
  during that delay; there is no transient unlock action. Reels reset after reveal.
- Read a reel's current letter from its dial aria-label:
  `Reel N: <letter>, <sound>. …`; global locked state from `aria-pressed` on
  `.machine-lock`.
- Reels are also hand-settable (luck + effort): TAPPING the `.reel-dial`
  opens an inline keyboard callout below the reel bank (`.picker-pop`,
  one `.picker-key` per aksharam with keyboard-state colors; its
  `.picker-caret` points at the targeted reel and slides when another
  reel is tapped; the targeted reel gets an emerald `.targeted` ring,
  distinct from the gold locked style; tapping the targeted reel again
  is a no-op — it closes only via ✕, the round ending, or locking the
  last reel). Picking
  snap-rolls the reel to that letter along the shortest path (REEL_SEQ =
  allKeys[(i*11)%35]), advances the callout to the next reel after the snap,
  and closes the callout after a pick on reel 5.
  Dragging the `.reel-dial` vertically still scrolls it with
  snap-to-letter. Locking is a separate global `.machine-lock` button;
  the dial itself never toggles locks.
  Tap-vs-dial on the dial is judged by outcome, not a pixel slop: a
  gesture that stays on the same letter and moves less than ~45% of an
  item height opens the picker (so wobbly touch taps land); a drag that
  reaches another letter dials and must NOT open the picker. Locked reels
  refuse picking and drags. To assemble a specific word fast in a test,
  pick each reel's target letter via the keyboard overlay, then lock all —
  no luck needed.
- The lever is a pointer gesture (pointerdown grabs with capture, pointerup
  spins; keyboard fires via click detail 0) and has `touch-action: none`,
  so pulling it on mobile must move the lever, never scroll the page.
- Blank-reel regression guard: during a full-speed pull, every
  `.reel-window` payline must always overlap a non-empty `.reel-item`
  (spins loop exactly once — STRIP_COPIES=4 alphabet copies of runway,
  reels resting in copy 1; keep strips short, tall composited layers
  caused mobile Safari memory-pressure page reloads).
- Reel 1 starts ON the answer's first aksharam but remains unlocked; the global
  lock triggers the auto-check. After game over
  the drum stays on the final
  guessed face (it must not roll to an empty face).
- Lever pulls land on dictionary entries that aren't the current answer or
  already guessed. Pulls
  also avoid words the lever already landed on since page load — a word may
  repeat only after every other available word has been shown; when
  no word remains, it falls back to weighted-random letters and the status
  says "free spin". To verify, replicate the dictionary in the test and
  assert each landing is a member and not the answer. New dictionary words
  must be real, kid-safe Malayalam — the build throws if one isn't exactly
  5 keyboard aksharams.
- The hint is a `.drum-hint` drawer under the drum. It briefly opens on load,
  collapses to a compact trigger, reopens for about 4.2 seconds after each
  wrong non-final reveal, then collapses for the new turn.
- The localized `.game-goal` replays its entrance animation whenever the
  language, category, or puzzle changes.
- The board is a pentagonal drum (`.drum-inner`); face i is front when its
  inline transform is `rotateX(<i*72>deg)`. It keeps the latest evaluated guess
  in front while `.attempt-status` advances to “Try N / 5”. Completed dots
  change faces; the current/future empty dots are disabled and the drum does
  not drag. Viewing an older completed guess auto-returns to the latest guess
  after 3 seconds; selecting another past guess restarts that timer.
- Picker key colors express positional possibilities. A solved reel highlights
  only its confirmed green aksharam. A globally present/orange aksharam appears
  orange on every unsolved reel except positions where it was already tried
  and marked misplaced. Known-absent keys remain dim.
- Globally locked letters preview live on the drum's active face.
- Test assertions now expect "Malayalam letter reels" and "Pull the lever"
  instead of the old keyboard strings.
- NEVER add `setPointerCapture` to a container whose children are buttons:
  capture retargets click events to the container (this broke the old globe).
