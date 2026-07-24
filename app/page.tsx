"use client";

import {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import posthog from "posthog-js";
import FeedbackForm from "./components/FeedbackForm";
import SlotMachine, { MachineEvent } from "./components/SlotMachine";
import WordDrum, { DrumRow } from "./components/WordDrum";
import {
  getPack,
  LANGUAGE_PACKS,
  LanguagePack,
  Puzzle,
  splitWord,
} from "./lib/content";
import { buzz, setSfxEnabled, sfx } from "./lib/sfx";

const MAX_GUESSES = 5;
const WORD_SIZE = 5;
const START_DATE = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;
const STORAGE_KEY = "chathuraksharam-stream-state-v2";
const SOUND_KEY = "chathuraksharam-sound-v1";
const AUTO_CHECK_DELAY_MS = 1200;
const WHATSAPP_CHANNEL_URL =
  "https://whatsapp.com/channel/0029VbDGDdmAe5VjVZMjtH3o";

// Tile-flip choreography. Keyboard state, confetti, and the result modal all
// wait for the final tile to land so the reveal stays suspenseful.
const FLIP_STAGGER_MS = 270;
const FLIP_DURATION_MS = 620;
const REVEAL_TOTAL_MS = FLIP_STAGGER_MS * (WORD_SIZE - 1) + FLIP_DURATION_MS;

const CONFETTI_PIECES = Array.from({ length: 44 }, (_, index) => ({
  delay: `${(index % 11) * 0.05}s`,
  drift: `${((index % 7) - 3) * 26}px`,
  left: `${6 + ((index * 13) % 88)}%`,
  rotation: `${(index * 47) % 360}deg`,
  spin: `${0.9 + (index % 5) * 0.35}s`,
}));

type TileState = "correct" | "present" | "absent" | "empty";

type PersistedState = {
  puzzleId: number;
  guesses: string[];
  solved: boolean;
  streak: number;
  played: number;
  wins: number;
  lastSolvedPuzzleId?: number;
};

// UTC keeps the server render and every player on the same starting round.
function getDailyPuzzleId() {
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.max(0, Math.floor((todayUtc - START_DATE) / DAY_MS));
}

function evaluateGuess(
  pack: LanguagePack,
  guess: string,
  answer: string,
): TileState[] {
  const guessTiles = splitWord(pack, guess);
  const answerTiles = splitWord(pack, answer);
  const result: TileState[] = Array(WORD_SIZE).fill("absent");
  const remaining = new Map<string, number>();

  answerTiles.forEach((tile, index) => {
    if (guessTiles[index] === tile) {
      result[index] = "correct";
      return;
    }
    remaining.set(tile, (remaining.get(tile) ?? 0) + 1);
  });

  guessTiles.forEach((tile, index) => {
    if (result[index] === "correct") return;
    const count = remaining.get(tile) ?? 0;
    if (count > 0) {
      result[index] = "present";
      remaining.set(tile, count - 1);
    }
  });

  return result;
}

function emptyState(puzzleId: number): PersistedState {
  return {
    puzzleId,
    guesses: [],
    solved: false,
    streak: 0,
    played: 0,
    wins: 0,
  };
}

function getInitialState(puzzleId: number, storageKey: string): PersistedState {
  if (typeof window === "undefined") return emptyState(puzzleId);

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return emptyState(puzzleId);

    const parsed = JSON.parse(stored) as PersistedState;
    if (typeof parsed.puzzleId !== "number") return emptyState(puzzleId);

    if (parsed.puzzleId !== puzzleId) {
      const keptStreak =
        parsed.lastSolvedPuzzleId === puzzleId - 1 ? parsed.streak : 0;
      return {
        ...emptyState(puzzleId),
        streak: keptStreak,
        played: parsed.played ?? 0,
        wins: parsed.wins ?? 0,
        lastSolvedPuzzleId: parsed.lastSolvedPuzzleId,
      };
    }

    return {
      ...emptyState(puzzleId),
      ...parsed,
      guesses: Array.isArray(parsed.guesses)
        ? parsed.guesses.slice(0, MAX_GUESSES)
        : [],
    };
  } catch {
    return emptyState(puzzleId);
  }
}

function getShareText(
  pack: LanguagePack,
  categoryId: string,
  categoryLabel: string,
  state: PersistedState,
  answer: Puzzle,
) {
  const rows = state.guesses.map((guess) =>
    evaluateGuess(pack, guess, answer.word)
      .map((tile) =>
        tile === "correct" ? "🟩" : tile === "present" ? "🟨" : "⬛",
      )
      .join(""),
  );
  const score = state.solved ? state.guesses.length : "X";

  return [
    `${pack.title} · ${pack.nativeName} · ${categoryLabel} ${state.puzzleId + 1} · ${score}/${MAX_GUESSES}`,
    ...rows,
    `🔥 ${state.streak} round streak`,
    `Can you solve a ${pack.name} word?`,
    `${window.location.origin}/?language=${encodeURIComponent(pack.id)}&category=${encodeURIComponent(categoryId)}`,
  ].join("\n");
}

function updateStreamUrl(languageId: string, categoryId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("language", languageId);
  url.searchParams.set("category", categoryId);
  window.history.replaceState(null, "", url);
}

function getKeyboardState(
  pack: LanguagePack,
  guesses: string[],
  answer: string,
) {
  const rank: Record<TileState, number> = {
    empty: 0,
    absent: 1,
    present: 2,
    correct: 3,
  };
  const states = new Map<string, TileState>();

  guesses.forEach((guess) => {
    const tiles = splitWord(pack, guess);
    const result = evaluateGuess(pack, guess, answer);

    tiles.forEach((tile, index) => {
      const next = result[index];
      const current = states.get(tile) ?? "empty";
      if (rank[next] > rank[current]) {
        states.set(tile, next);
      }
    });
  });

  return states;
}

function getPositionKeyboardStates(
  pack: LanguagePack,
  guesses: string[],
  answer: string,
  keys: LanguagePack["keys"],
) {
  const globalStates = getKeyboardState(pack, guesses, answer);
  const correctAt: Array<string | null> = Array(WORD_SIZE).fill(null);
  const misplacedAt = Array.from(
    { length: WORD_SIZE },
    () => new Set<string>(),
  );
  const presentLetters = new Set<string>();
  const states = Array.from(
    { length: WORD_SIZE },
    () => new Map<string, TileState>(),
  );

  guesses.forEach((guess) => {
    const tiles = splitWord(pack, guess);
    const result = evaluateGuess(pack, guess, answer);

    tiles.forEach((tile, index) => {
      if (result[index] === "correct") correctAt[index] = tile;
      if (result[index] === "present") {
        presentLetters.add(tile);
        misplacedAt[index].add(tile);
      }
    });
  });

  states.forEach((positionStates, index) => {
    keys.forEach((key) => {
      const tile = key.text;
      const confirmed = correctAt[index];

      if (confirmed) {
        if (tile === confirmed) positionStates.set(tile, "correct");
        else if (globalStates.get(tile) === "absent") {
          positionStates.set(tile, "absent");
        }
        return;
      }

      if (globalStates.get(tile) === "absent") {
        positionStates.set(tile, "absent");
      } else if (
        presentLetters.has(tile) &&
        !misplacedAt[index].has(tile)
      ) {
        positionStates.set(tile, "present");
      }
    });
  });

  return states;
}

export default function Home() {
  const [languageId, setLanguageId] = useState("en");
  const [categoryId, setCategoryId] = useState("everyday");
  const [puzzleId, setPuzzleId] = useState(0);
  const [dailyReady, setDailyReady] = useState(false);
  const pack = useMemo(() => getPack(languageId), [languageId]);
  const category = useMemo(
    () => pack.categories.find((item) => item.id === categoryId) ?? pack.categories[0],
    [categoryId, pack],
  );
  const answer = category.puzzles[puzzleId % category.puzzles.length];
  const answerTiles = useMemo(() => splitWord(pack, answer.word), [answer.word, pack]);
  const playableKeys = useMemo(() => {
    if (!category.deriveKeysFromPuzzles) return pack.keys;
    const words = [
      ...category.puzzles.map((puzzle) => puzzle.word),
      ...(category.dictionary ?? []),
    ];
    const tiles = [...new Set(words.flatMap((word) => splitWord(pack, word)))];
    return tiles.map((text) => ({
      text,
      sound: pack.keys.find((key) => key.text === text)?.sound ?? text,
    }));
  }, [category, pack]);
  const allKeys = useMemo(
    () => playableKeys.map((key) => ({ ml: key.text, sound: key.sound })),
    [playableKeys],
  );
  const getSound = useCallback(
    (tile: string) => pack.keys.find((key) => key.text === tile)?.sound ?? tile,
    [pack],
  );
  const guessWordTiles = useMemo(() => {
    const words = [
      ...(category.dictionary ?? pack.dictionary),
      ...category.puzzles.map((puzzle) => puzzle.word),
    ];
    return [...new Set(words)].map((word) => splitWord(pack, word));
  }, [category, pack]);
  const storageKey = `${STORAGE_KEY}-${pack.id}-${category.id}-${puzzleId}`;
  const [state, setState] = useState<PersistedState>(() => emptyState(puzzleId));
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showStreamMenu, setShowStreamMenu] = useState(false);
  const [hintReplayKey, setHintReplayKey] = useState(0);
  const [machineResetKey, setMachineResetKey] = useState(0);

  useEffect(() => {
    document.documentElement.lang = pack.locale;
    document.documentElement.dir = pack.direction;
    document.title = pack.title;
  }, [pack]);
  const [settledCount, setSettledCount] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [winWaveRow, setWinWaveRow] = useState<number | null>(null);
  const [shakeRow, setShakeRow] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const timeoutsRef = useRef<number[]>([]);
  const autoCheckRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // The route is statically generated, so choose the live UTC round only
    // after hydration. This avoids freezing the deployment day's answer into
    // the HTML or producing a server/client mismatch after midnight.
    /* eslint-disable react-hooks/set-state-in-effect */
    const params = new URLSearchParams(window.location.search);
    const requestedLanguage = params.get("language");
    const requestedCategory = params.get("category");
    const requestedPack =
      LANGUAGE_PACKS.find((item) => item.id === requestedLanguage) ??
      getPack("en");
    const requestedStream =
      requestedPack.categories.find((item) => item.id === requestedCategory) ??
      requestedPack.categories.find((item) => item.id === "everyday") ??
      requestedPack.categories[0];

    setLanguageId(requestedPack.id);
    setCategoryId(requestedStream.id);
    setPuzzleId(getDailyPuzzleId());
    setDailyReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const gameOver = state.solved || state.guesses.length >= MAX_GUESSES;
  const inputLocked = gameOver || revealing;
  const roundOver = gameOver && !revealing;
  const settledGuesses = useMemo(
    () => state.guesses.slice(0, settledCount),
    [state.guesses, settledCount],
  );
  const keyboardState = useMemo(
    () => getKeyboardState(pack, settledGuesses, answer.word),
    [answer.word, pack, settledGuesses],
  );
  const positionKeyboardStates = useMemo(
    () => getPositionKeyboardStates(pack, settledGuesses, answer.word, playableKeys),
    [answer.word, pack, playableKeys, settledGuesses],
  );

  // The drum keeps the latest evaluated guess visible. The attempt marker
  // advances separately, so a new turn is clear without showing an empty face.
  const activeRow = Math.max(0, state.guesses.length - 1);
  const currentAttempt =
    revealing || gameOver
      ? activeRow
      : Math.min(state.guesses.length, MAX_GUESSES - 1);

  const drumRows = useMemo<DrumRow[]>(
    () =>
      Array.from({ length: MAX_GUESSES }, (_, rowIndex) => {
        const guess = state.guesses[rowIndex];
        const raw = guess ? splitWord(pack, guess) : [];
        const tiles = Array.from(
          { length: WORD_SIZE },
          (_, index) => raw[index] ?? "",
        );
        return {
          tiles,
          result: guess
            ? evaluateGuess(pack, guess, answer.word)
            : Array(WORD_SIZE).fill("empty" as TileState),
          phase: guess
            ? rowIndex < settledCount
              ? ("settled" as const)
              : ("reveal" as const)
            : ("idle" as const),
        };
      }),
    [answer.word, pack, settledCount, state.guesses],
  );

  const later = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      if (autoCheckRef.current !== null) {
        window.clearTimeout(autoCheckRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Persisted state can only be read after mount; SSR markup must stay
    // deterministic, so this one-time hydration happens in an effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    const initial = getInitialState(puzzleId, storageKey);
    setState(initial);
    setSettledCount(initial.guesses.length);
    setMessage("");
    setCopied(false);
    setShowResultModal(false);
    setRevealing(false);
    const savedSound = window.localStorage.getItem(SOUND_KEY) !== "off";
    setSoundOn(savedSound);
    setSfxEnabled(savedSound);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [answerTiles, puzzleId, storageKey]);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [hydrated, state, storageKey]);

  useEffect(() => {
    if (!showConfetti) return;

    const timeout = window.setTimeout(() => setShowConfetti(false), 3400);
    return () => window.clearTimeout(timeout);
  }, [showConfetti]);

  // Desktop-only parallax: the play field leans toward the pointer, which
  // sells the depth of the translateZ-layered panels.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onMove = (event: PointerEvent) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        stage.style.setProperty("--tilt-x", `${(ny * -3.4).toFixed(2)}deg`);
        stage.style.setProperty("--tilt-y", `${(nx * 5).toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        stage.style.setProperty("--tilt-x", "0deg");
        stage.style.setProperty("--tilt-y", "0deg");
      });
    };

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSfxEnabled(next);
    window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    if (next) sfx.key();
    posthog.capture("sound_toggled", { sound_on: next });
  }

  // The single machine lock freezes all five reels and checks after a beat.
  function handleMachineChange(
    letters: string[],
    locked: boolean[],
    event: MachineEvent,
  ) {
    if (autoCheckRef.current !== null) {
      window.clearTimeout(autoCheckRef.current);
      autoCheckRef.current = null;
    }

    if (event === "land") {
      posthog.capture("lever_pulled", { result: "land", puzzle_id: puzzleId });
      setMessage("");
      return;
    }

    if (event === "freespin") {
      posthog.capture("lever_pulled", { result: "freespin", puzzle_id: puzzleId });
      setMessage("Free spin — no word fits those locks.");
      return;
    }

    if (event === "lock" && locked.every(Boolean)) {
      setMessage("Checking…");
      autoCheckRef.current = window.setTimeout(() => {
        autoCheckRef.current = null;
        submitWord(letters.join(""));
      }, AUTO_CHECK_DELAY_MS);
    }
  }

  function submitWord(word: string) {
    if (inputLocked) return;

    const normalized = splitWord(pack, word).join("");
    const tiles = splitWord(pack, normalized);

    if (tiles.length !== WORD_SIZE) {
      setMessage(
        pack.id === "ml"
          ? "Some of those letters join together. The reels were reset — try another combination."
          : `Enter exactly ${WORD_SIZE} ${pack.name} letters.`,
      );
      setMachineResetKey((current) => current + 1);
      setShakeRow(true);
      sfx.invalid();
      buzz(60);
      later(() => setShakeRow(false), 520);
      return;
    }

    const rowIndex = state.guesses.length;
    const solved = normalized === answer.word;
    const finalTry = rowIndex + 1 >= MAX_GUESSES;
    const finished = solved || finalTry;

    posthog.capture("word_guessed", {
      puzzle_id: puzzleId,
      guess_number: rowIndex + 1,
      correct: solved,
    });

    setState((current) => ({
      ...current,
      guesses: [...current.guesses, normalized],
      solved,
      played: finished ? current.played + 1 : current.played,
      wins: solved ? current.wins + 1 : current.wins,
      streak: solved ? current.streak + 1 : finalTry ? 0 : current.streak,
      lastSolvedPuzzleId: solved
        ? current.puzzleId
        : current.lastSolvedPuzzleId,
    }));
    setCopied(false);
    setRevealing(true);
    setMessage("Revealing…");

    for (let i = 0; i < WORD_SIZE; i += 1) {
      later(() => sfx.flip(i), i * FLIP_STAGGER_MS + 140);
    }

    later(() => {
      setSettledCount(rowIndex + 1);
      setRevealing(false);

      if (solved) {
        posthog.capture("puzzle_won", {
          puzzle_id: puzzleId,
          guesses_count: rowIndex + 1,
          streak: state.streak + 1,
        });
        setWinWaveRow(rowIndex);
        setShowConfetti(true);
        sfx.win();
        buzz([28, 40, 28, 40, 60]);
        setMessage(
          `Correct: ${answer.word} (${answer.pronunciation}) means "${answer.meaning}".`,
        );
        later(() => setShowResultModal(true), 1350);
      } else if (finalTry) {
        posthog.capture("puzzle_lost", {
          puzzle_id: puzzleId,
          streak: state.streak,
        });
        sfx.lose();
        buzz(90);
        setMessage(
          `The answer was ${answer.word} (${answer.pronunciation}), meaning "${answer.meaning}".`,
        );
        later(() => setShowResultModal(true), 750);
      } else {
        setHintReplayKey((current) => current + 1);
        setMessage("");
        later(() => sfx.roll(), 180);
      }
    }, REVEAL_TOTAL_MS + 60);
  }

  async function shareResult() {
    const text = getShareText(pack, category.id, category.label, state, answer);
    try {
      if (navigator.share) {
        await navigator.share({ text, title: pack.title });
        posthog.capture("result_shared", { method: "share", puzzle_id: puzzleId });
        setMessage("Result shared.");
      } else {
        await navigator.clipboard.writeText(text);
        posthog.capture("result_shared", { method: "clipboard", puzzle_id: puzzleId });
        setCopied(true);
        setMessage("Result copied.");
      }
    } catch {
      setMessage("Sharing was cancelled.");
    }
  }

  function trackWhatsAppChannel() {
    posthog.capture("whatsapp_channel_clicked", {
      category: category.id,
      language: pack.id,
      puzzle_id: puzzleId,
    });
  }

  function nextPuzzle() {
    setShowResultModal(false);
    setHintReplayKey(0);
    setPuzzleId((current) => current + 1);
  }

  function chooseLanguage(id: string) {
    setLanguageId(id);
    setCategoryId("everyday");
    updateStreamUrl(id, "everyday");
    setHintReplayKey(0);
    setPuzzleId(getDailyPuzzleId());
  }

  function chooseCategory(id: string) {
    setCategoryId(id);
    updateStreamUrl(pack.id, id);
    setHintReplayKey(0);
    setPuzzleId(getDailyPuzzleId());
  }

  return (
    <main className={`game-main ${dailyReady ? "" : "daily-loading"} ${category.theme === "onam" ? "theme-onam" : ""}`}>
      {showConfetti ? (
        <div className="confetti-burst" aria-hidden="true">
          {CONFETTI_PIECES.map((piece, index) => (
            <span
              className={`confetti-piece ${category.theme === "onam" ? "flower-petal" : ""}`}
              key={`confetti-${index}`}
              style={{
                "--confetti-delay": piece.delay,
                "--confetti-drift": piece.drift,
                "--confetti-left": piece.left,
                "--confetti-rotation": piece.rotation,
                "--confetti-spin": piece.spin,
              } as CSSProperties}
            >
              {category.theme === "onam" ? ["🌼", "🌸", "🏵️", "🌺"][index % 4] : null}
            </span>
          ))}
        </div>
      ) : null}
      {showResultModal ? (
        <div
          aria-labelledby="result-title"
          aria-modal="true"
          className="modal-overlay fixed inset-0 z-30 grid place-items-center p-5"
          role="dialog"
        >
          <div className="result-card w-full max-w-md p-6">
            <p className="result-eyebrow">
              {pack.nativeName} · {category.icon} {category.label} · Round {puzzleId + 1}
            </p>
            <h2 className="result-title mt-2 text-3xl" id="result-title">
              {state.solved ? "You got it!" : "Puzzle complete"}
            </h2>
            <p className="result-score mt-2 text-lg">
              {state.solved ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`} · 🔥 {state.streak}
            </p>
            <div aria-label="Spoiler-free result" className="mt-4 space-y-1 text-xl leading-none">
              {state.guesses.map((guess, index) => (
                <p key={`${guess}-${index}`}>
                  {evaluateGuess(pack, guess, answer.word)
                    .map((tile) => tile === "correct" ? "🟩" : tile === "present" ? "🟨" : "⬛")
                    .join("")}
                </p>
              ))}
            </div>
            <p className="result-meaning mt-3 text-base leading-7">
              <strong>{answer.word}</strong> ({answer.pronunciation}) means “{answer.meaning}”.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                className="btn-ghost px-5 py-3"
                onClick={() => setShowResultModal(false)}
                type="button"
              >
                Close
              </button>
              <button
                className="btn-primary px-5 py-3"
                onClick={shareResult}
                type="button"
              >
                {copied ? "Copied" : "Share result"}
              </button>
            </div>
            <button
              className="btn-outline mt-3 block w-full px-5 py-3 text-center"
              onClick={nextPuzzle}
              type="button"
            >
              Next {category.icon} {category.label} puzzle →
            </button>
          </div>
        </div>
      ) : null}
      <section className="site-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="game-header flex items-center justify-between gap-3 pb-3">
          <div className="title-block flex items-center gap-3">
            <div>
              <h1 className="game-title">{pack.title}</h1>
            </div>
            <p className="game-chip">#{puzzleId + 1}</p>
          </div>
          <div className="header-controls flex items-center gap-3">
            <div className="stream-menu-wrap">
              <button
                aria-expanded={showStreamMenu}
                aria-haspopup="menu"
                className={`stream-trigger ${showStreamMenu ? "active" : ""}`}
                onClick={() => setShowStreamMenu((open) => !open)}
                type="button"
              >
                <span>{pack.nativeName}</span>
                <b>{category.icon} {category.label}</b>
                <i aria-hidden="true">⌄</i>
              </button>
              {showStreamMenu ? (
                <div aria-label="Choose language and category" className="stream-menu" role="menu">
                  <span className="stream-menu-label">Language</span>
                  <div className="stream-menu-grid languages">
                    {LANGUAGE_PACKS.map((language) => (
                      <button
                        aria-pressed={language.id === pack.id}
                        className={language.id === pack.id ? "active" : ""}
                        key={language.id}
                        onClick={() => chooseLanguage(language.id)}
                        type="button"
                      >
                        {language.nativeName}
                      </button>
                    ))}
                  </div>
                  <span className="stream-menu-label">Category</span>
                  <div className="stream-menu-grid categories">
                    {pack.categories.map((item) => (
                      <button
                        aria-pressed={item.id === category.id}
                        className={item.id === category.id ? "active" : ""}
                        key={item.id}
                        onClick={() => chooseCategory(item.id)}
                        type="button"
                      >
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="stream-menu-done"
                    onClick={() => setShowStreamMenu(false)}
                    type="button"
                  >
                    Done
                  </button>
                </div>
              ) : null}
            </div>
            <button
              aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
              aria-pressed={soundOn}
              className="sound-toggle"
              onClick={toggleSound}
              type="button"
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
          </div>
        </header>

        <div className="game-layout grid flex-1 items-start py-6">
          <div className="tilt-stage" ref={stageRef}>
            <section
              aria-label={`${pack.name} ${category.label} word puzzle`}
              className="puzzle-panel tilt-body mx-auto w-full max-w-xl"
            >
              <aside
                className="game-goal arriving"
                key={`goal-${pack.id}-${category.id}-${puzzleId}`}
              >
                <span aria-hidden="true">◎</span>
                <p><strong>{pack.goal.label}:</strong> {pack.goal.text}</p>
              </aside>
              <WordDrum
                activeRow={activeRow}
                attemptLabel={pack.attemptLabel}
                currentAttempt={currentAttempt}
                hint={answer.clue}
                hintLabel={pack.hintLabel}
                hintReplayKey={hintReplayKey}
                key={`drum-${pack.id}-${category.id}-${puzzleId}`}
                rows={drumRows}
                shakeRow={shakeRow}
                soundFor={getSound}
                winWaveRow={winWaveRow}
              />

              <p className="status-message mt-4 min-h-7 text-center text-base">
                {message}
              </p>

              <SlotMachine
                answer={answer.word}
                dictionary={guessWordTiles}
                disabled={inputLocked}
                keyboardState={keyboardState}
                positionKeyboardStates={positionKeyboardStates}
                key={`machine-${pack.id}-${category.id}-${puzzleId}`}
                keys={allKeys}
                guideLabels={pack.guide}
                onChange={handleMachineChange}
                presetLetter={answerTiles[0]}
                reelsLabel={`${pack.name} letter reels`}
                roundKey={`${pack.id}-${category.id}-${puzzleId}-${state.guesses.length}-${machineResetKey}`}
                usedWords={state.guesses}
              />

              {roundOver ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    className="btn-primary px-6 py-3 text-sm uppercase tracking-[0.14em]"
                    onClick={shareResult}
                    type="button"
                  >
                    {copied ? "Copied" : "Share result"}
                  </button>
                  <button
                    className="btn-outline px-6 py-3 text-sm uppercase tracking-[0.14em]"
                    onClick={nextPuzzle}
                    type="button"
                  >
                    Next puzzle →
                  </button>
                </div>
              ) : null}
            </section>
          </div>
          <div className="community-actions mx-auto mt-7">
            <a
              className="community-link"
              href={WHATSAPP_CHANNEL_URL}
              onClick={trackWhatsAppChannel}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span aria-hidden="true">◉</span>
              Follow updates
              <span aria-hidden="true">→</span>
            </a>
            <FeedbackForm
              category={category.id}
              language={pack.id}
              puzzle={puzzleId + 1}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
