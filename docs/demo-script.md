# Demo video outline (under 3 minutes)

## 0:00–0:20 — The problem

Show the Malayalam stream and say:

> Most word games begin with English and translate the surface later. But a
> language shapes its writing system, input, clues, and culture. Chathuraksharam
> began as a Malayalam-first game and became a multilingual puzzle engine.

## 0:20–0:55 — The interaction

Pull the lever, lock two useful reels, pull again, and open the direct letter
picker.

> Pulling the lever always prefers a real word that fits the locked letters.
> Players can trust luck, or tap and dial individual reels. Five guesses wrap
> around a 3D word drum.

## 0:55–1:30 — Languages and categories

Switch from Malayalam Arts to English Sports, then Spanish Everyday.

> The demo supports Malayalam, English, and Spanish. Each has Everyday, Arts,
> and Sports streams with localized clues. A completed round leads directly to
> the next puzzle, so the experience is not limited to once a day.

## 1:30–2:10 — GPT-5.6 and validation

Show `content/es.json`, `scripts/generate-puzzles.mjs`, and run:

```bash
npm run generate:puzzles -- --language=es --category=arts --count=3
npm run validate:content
```

> GPT-5.6 creates candidate packs through the Responses API and a strict JSON
> schema. Model output is never trusted blindly. Our validator uses locale-aware
> Unicode grapheme segmentation and rejects words with the wrong tile count or
> letters missing from that language’s keyboard. Valid candidates are reviewed
> and shared as fast static content for every player.

## 2:10–2:40 — Codex

Show the repository diff or Codex task.

> Codex helped us evolve a tightly coupled Malayalam daily game into this typed
> language-pack architecture. It handled the refactor, validation workflow,
> responsive styling, production builds, and real browser tests without losing
> the original game feel.

## 2:40–2:55 — Close

Return to the spinning reels.

> Chathuraksharam makes language and culture playable—one word, one category,
> and eventually one community at a time.
