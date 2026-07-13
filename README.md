# Chathuraksharam — ചതുരക്ഷരം

A daily Malayalam word puzzle, reimagined as a 3D slot machine. Guess the
five-aksharam word of the day in five tries: pull the lever and the letter
reels land on a real Malayalam word that fits your locked letters, or dial
each reel by hand like a combination lock. Lock all five and the word is
checked — green for right spot, gold for in the word, dark for not used.

Built for Malayalam speakers and learners alike: learner mode shows Manglish
sounds under every aksharam, and a lookup panel maps English meanings to the
word bank.

## Features

- **Slot-machine input** — a pullable lever with weighted reels, plus
  suitcase-lock dialing (▲▼ nudges or drag with snap-to-letter)
- **Dictionary pulls** — the lever always lands on a real Malayalam word
  matching your locked letters when one exists
- **3D word drum** — one guess per face of a rolling pentagonal barrel,
  with staggered tile-flip reveals
- **Kerala-night design** — glassmorphism, brass-gold accents, a canvas
  backdrop of drifting aksharams, and pointer-driven parallax
- **Juice** — WebAudio synth sounds (mutable), haptics, confetti, streaks,
  share cards, and a daily calendar reminder
- Daily puzzle anchored to the UTC day, so the whole world plays the same
  word; state persists in `localStorage`

## Development

Requires Node.js `>=20.9`.

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm test        # builds, boots the production server, asserts the SSR HTML
```

## Deploying

A standard Next.js app — deploy to [Vercel](https://vercel.com) by importing
this repository; no configuration needed.

## Word bank

Answers and the guess dictionary live in `app/page.tsx` (`WORDS` and
`EXTRA_GUESS_WORDS`). A build-time check fails the build if any entry is not
exactly five aksharams typeable on the on-screen keys, so new words are safe
to add freely.
