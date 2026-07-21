## Inspiration

Many word games treat English as the default and translation as an afterthought.
Chathuraksharam began as a Malayalam-first experiment: could a word puzzle feel
native to a writing system instead of forcing it into an English keyboard?

After playing it, we realized the larger opportunity was not another daily
word game. It was a reusable engine for playful language and cultural discovery.
A Malayalam speaker might want poetry and local arts; a Spanish speaker might
want everyday words and sports. People should be able to keep exploring instead
of being stopped after one puzzle per day.

## What it does

Chathuraksharam is a tactile multilingual word game. Players pull a 3D lever to
spin five letter reels. The reels prefer real words compatible with the letters
the player has locked. Players can also tap a reel to choose a letter or drag it
like a combination dial. Green, gold, and dark tiles reveal how each guess
relates to the answer.

The working demo includes Malayalam, English, and Spanish with Everyday, Arts,
and Sports streams. Each stream contains consecutive rounds, so players can
continue immediately instead of waiting for tomorrow.

Behind the game is a reusable language-pack format. Each pack supplies its
locale, Unicode grapheme rules, playable alphabet, localized clues, categories,
and dictionary. A GPT-5.6 authoring command can create structured candidate
puzzle packs, which are independently validated before review and publication.

## How we built it

We built the experience with Next.js, React, TypeScript, CSS 3D transforms,
WebAudio, `Intl.Segmenter`, the OpenAI Responses API, GPT-5.6, and Codex.

The original game was tightly coupled to a hard-coded Malayalam word bank and
keyboard. With Codex, we extracted that implementation into a typed language
contract and JSON content packs, then generalized segmentation, reel alphabets,
clues, dictionaries, persistence, sharing, and category progression.

Puzzle generation happens as an authoring workflow rather than during play.
GPT-5.6 returns candidates through a strict JSON schema. A deterministic local
gate rejects any word with the wrong grapheme count, an unavailable keyboard
tile, or incomplete clue metadata. Approved JSON is shared by all players, so
the live game remains instant and dependable without runtime storage.

Codex also drove the production build, content checks, and real browser tests
across desktop and a 390×844 mobile viewport.

## Challenges we ran into

“Five letters” is not a universal technical concept. Malayalam aksharams can
contain several Unicode code points while appearing as one playable unit.
Spanish adds accented graphemes, and future scripts may be right-to-left. We
could not safely use string length or assume a Latin keyboard.

The slot-machine mechanic created another constraint: a generated answer is not
enough. The game needs a compatible dictionary so lever pulls remain meaningful
as players lock more positions. That made deterministic content validation as
important as generation.

Finally, we deliberately resisted generating content during a player request.
On-demand generation looked infrastructure-free, but it would create latency,
repeated cost, inconsistent puzzles, and a fragile demo. Separating authoring
from serving produced the stronger product.

## Accomplishments that we're proud of

- Turned a Malayalam-specific game into a working three-language engine without
  losing its distinctive 3D interaction.
- Added nine category streams and 27 playable answer rounds.
- Validated 151 shared dictionary entries across three writing systems.
- Built a GPT-5.6 structured authoring workflow with an independent Unicode and
  keyboard correctness gate.
- Preserved a zero-database, zero-runtime-secret deployment path.
- Verified language and category switching, dictionary-based lever landings,
  and a no-overflow mobile layout in a production build.

## What we learned

Multilingual software is not produced by translating labels. The language must
shape tokenization, input, typography, validation, clues, and content curation.
We also learned that generative AI is most valuable here as an editorial force
multiplier, while deterministic code remains responsible for whether a puzzle
is actually playable.

Codex made it practical to evolve the architecture while continuously checking
the existing interaction surface instead of rebuilding the game from scratch.

## What's next for Chathuraksharam

Next we will add reviewed language packs through community contributors, support
right-to-left scripts and variable word lengths, and move approved puzzle packs
to a shared content service. A scheduled GPT-5.6 pipeline can then prepare
source-backed streams for current events, regional arts, and sports, with
expiration dates and editorial review before publication.

Longer term, players will be able to follow the languages and cultural streams
they care about while teachers and community organizations publish trusted
packs for their own audiences.

## Built with

Next.js, React, TypeScript, OpenAI Responses API, GPT-5.6, Codex, JSON Schema,
Intl.Segmenter, CSS 3D, WebAudio, PostHog, Vercel
