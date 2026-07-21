# Chathuraksharam — words without borders

Chathuraksharam is a multilingual word game built around a tactile 3D slot
machine. Pull the lever to land on a real word, lock useful letters, and solve
the five-tile answer in five tries.

The current demo supports Malayalam, English, and Spanish. Each language has
Everyday, Arts, and Sports streams, and completing a round immediately opens
the next puzzle instead of imposing a once-per-day limit.

## What makes it different

- **Language packs** define locale-aware grapheme segmentation, playable
  letters, localized category names, clues, and reusable puzzle dictionaries.
- **GPT-5.6 puzzle authoring** creates structured candidate packs outside the
  request path. Candidates are written only after deterministic validation.
- **Shared, dependable gameplay** serves reviewed JSON to every player—no
  model latency, API key, database, or generated surprise during a round.
- **Dictionary-aware reels** always prefer a real word that matches the
  player’s locked letters.
- **Accessible direct input** lets a player tap a reel to choose a letter or
  drag it like a combination dial.

## Architecture

Language and puzzle packs live in [`content/`](content/). Every pack declares:

- language, locale, direction, and fixed tile count;
- the playable keyboard/reel alphabet;
- localized category streams and puzzle clues;
- a shared dictionary used by the slot-machine landing algorithm.

`app/lib/content.ts` normalizes and validates all packs at build time. The
standalone content validator repeats those checks in CI and catches:

- words with the wrong number of Unicode grapheme clusters;
- words containing tiles absent from the language keyboard;
- missing puzzle fields.

## GPT-5.6 puzzle generation

Set an OpenAI API key in `.env.local` (which is gitignored) and generate a
candidate pack:

```dotenv
OPENAI_API_KEY=your_key
```

```bash
npm run generate:puzzles -- --language=es --category=arts --count=6
```

The authoring command calls the OpenAI Responses API with `gpt-5.6` and a
strict JSON schema. It then independently validates every generated word
against `Intl.Segmenter`, the language’s word size, and its playable alphabet.
Valid output is written under `content/generated/` for review; it is never
silently published into the game.

The Spanish Arts stream includes a reviewed GPT-5.6 generation from July 20,
2026 (`mural`, `ópera`, and `museo`) with provenance recorded in the pack.

This authoring-time workflow provides one culturally relevant pack for all
players while keeping gameplay fast, consistent, safe, and inexpensive.

## Development

Requires Node.js `>=20.9`.

```bash
npm install
npm run dev
npm run validate:content
npm run lint
npm test
```

## Deploying

Deploy the Next.js app to Vercel or any Node-compatible platform. The playable
demo does not require runtime secrets or storage. `OPENAI_API_KEY` is needed
only by the optional authoring command and must never be exposed to the client.

## Built with Codex

Codex was used throughout product discovery, architectural refactoring,
language-pack design, validation, responsive browser testing, and documentation.
The repository history and supplied Codex session show the move from a single
Malayalam daily puzzle to an extensible multilingual category engine.

## License

Chathuraksharam is available under the [MIT License](LICENSE).
