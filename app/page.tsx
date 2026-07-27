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
import * as Dialog from "@radix-ui/react-dialog";
import FeedbackForm from "./components/FeedbackForm";
import SlotMachine, { MachineEvent } from "./components/SlotMachine";
import WordDrum, { DrumRow } from "./components/WordDrum";
import {
  getPack,
  isCategoryAvailable,
  Category,
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
const EXPERIENCE_KEY = "chathuraksharam-experience-v1";
const STREAM_PREFERENCE_KEY = "chathuraksharam-stream-preference-v1";
const AUTO_CHECK_DELAY_MS = 1200;
const WHATSAPP_CHANNEL_URL =
  "https://whatsapp.com/channel/0029VbDGDdmAe5VjVZMjtH3o";

// Intl.Collator groups Malayalam text by code point, but that can interleave
// conjuncts with the familiar vowel forms. The picker follows the order taught
// with the alphabet instead: vowels, consonant families, then each consonant's
// a/aa/i/ii/u/uu/... forms before its conjuncts and chillus.
const MALAYALAM_VOWELS = [
  "അ", "ആ", "ഇ", "ഈ", "ഉ", "ഊ", "ഋ", "ൠ", "ഌ", "ൡ",
  "എ", "ഏ", "ഐ", "ഒ", "ഓ", "ഔ", "അം", "അഃ",
];
const MALAYALAM_CONSONANTS = Array.from(
  "കഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ",
);
const MALAYALAM_VOWEL_SIGNS = [
  "", "ാ", "ി", "ീ", "ു", "ൂ", "ൃ", "ൄ", "െ", "േ", "ൈ", "ൊ", "ോ", "ൌ", "ം", "ഃ", "്",
];
const MALAYALAM_CHILLU_BASE = new Map([
  ["ൺ", "ണ"], ["ൻ", "ന"], ["ർ", "ര"], ["ൽ", "ല"], ["ൾ", "ള"], ["ൿ", "ക"],
]);

function malayalamPickerRank(text: string) {
  const vowel = MALAYALAM_VOWELS.indexOf(text);
  if (vowel >= 0) return [0, vowel, 0, 0] as const;

  const first = Array.from(text)[0] ?? "";
  const base = MALAYALAM_CHILLU_BASE.get(first) ?? first;
  const consonant = MALAYALAM_CONSONANTS.indexOf(base);
  if (consonant < 0) return [2, Number.MAX_SAFE_INTEGER, 0, 0] as const;

  const isChillu = MALAYALAM_CHILLU_BASE.has(first);
  const isConjunct = text.includes("്");
  const sign = MALAYALAM_VOWEL_SIGNS.findIndex(
    (candidate) => candidate !== "" && text.endsWith(candidate),
  );
  return [
    1,
    consonant,
    isChillu ? 2 : isConjunct ? 1 : 0,
    sign >= 0 ? sign : 0,
  ] as const;
}

function compareMalayalamPickerKeys(
  a: { ml: string; sound: string },
  b: { ml: string; sound: string },
) {
  const aRank = malayalamPickerRank(a.ml);
  const bRank = malayalamPickerRank(b.ml);
  for (let index = 0; index < 3; index += 1) {
    if (aRank[index] !== bRank[index]) return aRank[index] - bRank[index];
  }

  // Keep each conjunct stem together (മ്പ, മ്പി, then മ്മാ) before applying
  // the vowel-form order within that stem.
  if (aRank[2] === 1 && bRank[2] === 1) {
    const stripSign = (text: string) =>
      text.replace(/[ാിീുൂൃൄെേൈൊോൌംഃ്]$/u, "");
    const stemOrder = stripSign(a.ml).localeCompare(stripSign(b.ml), "ml");
    if (stemOrder !== 0) return stemOrder;
  }
  if (aRank[3] !== bRank[3]) return aRank[3] - bRank[3];
  return a.ml.localeCompare(b.ml, "ml") || a.sound.localeCompare(b.sound, "ml");
}

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

function formatCopy(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (copy, [key, value]) => copy.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

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

function getWrongGuessMessage(
  pack: LanguagePack,
  nextAttempt: number,
) {
  return formatCopy(pack.ui.wrongGuess, {
    attempt: nextAttempt,
    max: MAX_GUESSES,
  });
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
    `🔥 ${formatCopy(pack.ui.streakShare, { count: state.streak })}`,
    formatCopy(pack.ui.challengeShare, { language: pack.name }),
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
  const [customCategory, setCustomCategory] = useState<Category | null>(null);
  const pack = useMemo(() => getPack(languageId), [languageId]);
  const category = useMemo(
    () =>
      (categoryId === "custom" ? customCategory : null) ??
      pack.categories.find((item) => item.id === categoryId) ??
      pack.categories[0],
    [categoryId, customCategory, pack],
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
  const pickerKeys = useMemo(() => {
    if (pack.locale === "ml") return [...allKeys].sort(compareMalayalamPickerKeys);
    const collator = new Intl.Collator(pack.locale, { sensitivity: "base" });
    return [...allKeys].sort(
      (a, b) =>
        collator.compare(a.ml, b.ml) ||
        a.sound.localeCompare(b.sound, pack.locale),
    );
  }, [allKeys, pack.locale]);
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
  const [machineResetKey, setMachineResetKey] = useState(0);
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [showHowTo, setShowHowTo] = useState(true);

  useEffect(() => {
    document.documentElement.lang = pack.locale;
    document.documentElement.dir = pack.direction;
    const titleFrame = window.requestAnimationFrame(() => {
      document.title = pack.title;
    });
    return () => window.cancelAnimationFrame(titleFrame);
  }, [pack]);
  const [settledCount, setSettledCount] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [winWaveRow, setWinWaveRow] = useState<number | null>(null);
  const [shakeRow, setShakeRow] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const timeoutsRef = useRef<number[]>([]);
  const autoCheckRef = useRef<number | null>(null);
  const firstInputTrackedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamMenuRef = useRef<HTMLDivElement>(null);
  const streamTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showStreamMenu) return;

    const closeMenu = (restoreFocus: boolean) => {
      setShowStreamMenu(false);
      if (restoreFocus) window.setTimeout(() => streamTriggerRef.current?.focus(), 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!streamMenuRef.current?.contains(event.target as Node)) closeMenu(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showStreamMenu]);

  useLayoutEffect(() => {
    // The route is statically generated, so choose the live UTC round only
    // after hydration. This avoids freezing the deployment day's answer into
    // the HTML or producing a server/client mismatch after midnight.
    /* eslint-disable react-hooks/set-state-in-effect */
    const params = new URLSearchParams(window.location.search);
    let preferredStream: { language?: string; category?: string } | null = null;
    let returningPlayer = false;
    try {
      preferredStream = JSON.parse(
        window.localStorage.getItem(STREAM_PREFERENCE_KEY) ?? "null",
      ) as { language?: string; category?: string } | null;
      returningPlayer =
        window.localStorage.getItem(EXPERIENCE_KEY) === "complete";
    } catch {
      preferredStream = null;
    }
    setIsFirstTime(!returningPlayer);
    setShowHowTo(!returningPlayer);

    const requestedLanguage =
      params.get("language") ?? preferredStream?.language ?? null;
    const requestedCategory =
      params.get("category") ?? preferredStream?.category ?? null;
    const customAlias = requestedLanguage === "custom";
    const customRequested =
      customAlias ||
      (requestedLanguage === "ml" && requestedCategory === "custom");

    const loadDefault = () => {
      window.history.replaceState(null, "", window.location.pathname);
      setCustomCategory(null);
      setLanguageId("en");
      setCategoryId("everyday");
      setPuzzleId(getDailyPuzzleId());
      setDailyReady(true);
    };

    if (customRequested) {
      const controller = new AbortController();
      void fetch("/api/custom-pack", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Custom pack unavailable");
          return response.json() as Promise<Category>;
        })
        .then((loadedCategory) => {
          setCustomCategory(loadedCategory);
          setLanguageId("ml");
          setCategoryId("custom");
          setPuzzleId(getDailyPuzzleId());
          setDailyReady(true);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          loadDefault();
        });
      return () => controller.abort();
    }

    const requestedPack =
      LANGUAGE_PACKS.find((item) => item.id === requestedLanguage) ??
      getPack("en");
    const requestedCategoryMatch = requestedPack.categories.find(
      (item) => item.id === requestedCategory,
    );
    const expiredRequest =
      requestedCategoryMatch && !isCategoryAvailable(requestedCategoryMatch);
    const activePack = expiredRequest ? getPack("en") : requestedPack;
    const requestedStream =
      (!expiredRequest ? requestedCategoryMatch : undefined) ??
      activePack.categories.find((item) => item.id === "everyday") ??
      activePack.categories[0];

    if (expiredRequest) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    setLanguageId(activePack.id);
    setCategoryId(requestedStream.id);
    setPuzzleId(getDailyPuzzleId());
    setDailyReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!dailyReady || category.id === "custom") return;
    window.localStorage.setItem(
      STREAM_PREFERENCE_KEY,
      JSON.stringify({ language: pack.id, category: category.id }),
    );
  }, [category.id, dailyReady, pack.id]);

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

  // Show the evaluated guess through its reveal, then roll to the next empty
  // face so the start of another turn is unambiguous.
  const activeRow =
    revealing || gameOver
      ? Math.max(0, state.guesses.length - 1)
      : Math.min(state.guesses.length, MAX_GUESSES - 1);
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
  const continuationMessage = useMemo(() => {
    if (gameOver || revealing || state.guesses.length === 0) return "";
    return getWrongGuessMessage(pack, state.guesses.length + 1);
  }, [gameOver, pack, revealing, state.guesses.length]);

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
      if (!firstInputTrackedRef.current) {
        firstInputTrackedRef.current = true;
        posthog.capture("game_input_started", {
          language: pack.id,
          method: "lever",
          new_player: isFirstTime,
          puzzle_id: puzzleId,
        });
      }
      setMessage(pack.ui.adjustInstruction);
      return;
    }

    if (event === "freespin") {
      posthog.capture("lever_pulled", { result: "freespin", puzzle_id: puzzleId });
      if (!firstInputTrackedRef.current) {
        firstInputTrackedRef.current = true;
        posthog.capture("game_input_started", {
          language: pack.id,
          method: "lever",
          new_player: isFirstTime,
          puzzle_id: puzzleId,
        });
      }
      setMessage(pack.ui.freeSpin);
      return;
    }

    if (event === "picker") {
      posthog.capture("letter_picker_opened", {
        language: pack.id,
        puzzle_id: puzzleId,
      });
      setMessage(pack.ui.pickInstruction);
      return;
    }

    if (event === "dial") {
      if (!firstInputTrackedRef.current) {
        firstInputTrackedRef.current = true;
        posthog.capture("game_input_started", {
          language: pack.id,
          method: "reel",
          new_player: isFirstTime,
          puzzle_id: puzzleId,
        });
      }
      setMessage(pack.ui.readyInstruction);
      return;
    }

    if (event === "lock" && locked.every(Boolean)) {
      setMessage(pack.ui.checking);
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
      setMessage(pack.id === "ml" ? pack.ui.invalidJoined : pack.ui.invalidLength);
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

    if (isFirstTime) {
      window.localStorage.setItem(EXPERIENCE_KEY, "complete");
      setIsFirstTime(false);
      setShowHowTo(false);
      posthog.capture("first_game_tutorial_completed", {
        language: pack.id,
        puzzle_id: puzzleId,
      });
    }

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
    setMessage(pack.ui.revealing);

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
        setMessage(formatCopy(pack.ui.correct, {
          word: answer.word,
          pronunciation: answer.pronunciation,
          meaning: answer.meaning,
        }));
        later(() => setShowResultModal(true), 1350);
      } else if (finalTry) {
        posthog.capture("puzzle_lost", {
          puzzle_id: puzzleId,
          streak: state.streak,
        });
        sfx.lose();
        buzz(90);
        setMessage(formatCopy(pack.ui.answerWas, {
          word: answer.word,
          pronunciation: answer.pronunciation,
          meaning: answer.meaning,
        }));
        later(() => setShowResultModal(true), 750);
      } else {
        setMessage(getWrongGuessMessage(pack, rowIndex + 2));
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
        setMessage(pack.ui.resultShared);
      } else {
        await navigator.clipboard.writeText(text);
        posthog.capture("result_shared", { method: "clipboard", puzzle_id: puzzleId });
        setCopied(true);
        setMessage(pack.ui.resultCopied);
      }
    } catch {
      setMessage(pack.ui.sharingCancelled);
    }
  }

  function shareToWhatsApp() {
    const text = getShareText(pack, category.id, category.label, state, answer);
    posthog.capture("result_shared", { method: "whatsapp", puzzle_id: puzzleId });
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
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
    setPuzzleId((current) => current + 1);
  }

  function chooseLanguage(id: string) {
    setLanguageId(id);
    setCategoryId("everyday");
    updateStreamUrl(id, "everyday");
    setPuzzleId(getDailyPuzzleId());
  }

  function chooseCategory(id: string) {
    setCategoryId(id);
    updateStreamUrl(pack.id, id);
    setPuzzleId(getDailyPuzzleId());
  }

  return (
    <main className={`game-main ${dailyReady ? "" : "daily-loading"} ${category.theme === "onam" ? "theme-onam" : ""} ${category.id === "custom" ? "theme-custom" : ""}`}>
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
      <Dialog.Root open={showResultModal} onOpenChange={setShowResultModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay fixed inset-0 z-30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-30 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2">
            <div className="result-card w-full p-6">
            <p className="result-eyebrow">
              {pack.nativeName} · {category.icon} {category.label} · {pack.ui.round} {puzzleId + 1}
            </p>
            <Dialog.Title asChild>
              <h2 className="result-title mt-2 text-3xl">
                {state.solved ? pack.ui.won : pack.ui.puzzleComplete}
              </h2>
            </Dialog.Title>
            <p className="result-score mt-2 text-lg">
              {state.solved ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`} · 🔥 {state.streak}
            </p>
            <div className="result-answer-reveal mt-4">
              <p className="result-section-label">
                {state.solved ? pack.ui.answerConfirmed : pack.ui.answerReveal}
              </p>
              <Dialog.Description asChild>
                <p className="result-meaning text-base leading-7">
                  {formatCopy(pack.ui.means, {
                    word: answer.word,
                    pronunciation: answer.pronunciation,
                    meaning: answer.meaning,
                  })}
                </p>
              </Dialog.Description>
            </div>
            <div className="result-share-preview mt-3">
              <p className="result-section-label">{pack.ui.sharePreview}</p>
              <p className="result-share-note">
                {pack.ui.shareNote}
              </p>
              <div aria-label={pack.ui.sharePreview} className="mt-2 space-y-1 text-xl leading-none">
                {state.guesses.map((guess, index) => (
                  <p key={`${guess}-${index}`}>
                    {evaluateGuess(pack, guess, answer.word)
                      .map((tile) => tile === "correct" ? "🟩" : tile === "present" ? "🟨" : "⬛")
                      .join("")}
                  </p>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                className="btn-ghost px-5 py-3"
                onClick={() => setShowResultModal(false)}
                type="button"
              >
                {pack.ui.close}
              </button>
              <button
                className="btn-primary px-5 py-3"
                onClick={shareToWhatsApp}
                type="button"
              >
                WhatsApp
              </button>
            </div>
            <button
              className="btn-outline mt-3 block w-full px-5 py-3 text-center"
              onClick={shareResult}
              type="button"
            >
              {copied ? pack.ui.copied : pack.ui.moreShareOptions}
            </button>
            <button
              className="btn-outline mt-3 block w-full px-5 py-3 text-center"
              onClick={nextPuzzle}
              type="button"
            >
              {pack.ui.nextPuzzle} {category.icon} {category.label} →
            </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <section className="site-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="game-header flex items-center justify-between gap-3 pb-3">
          <div className="title-block flex items-center gap-3">
            <div>
              <h1 className="game-title">{pack.title}</h1>
            </div>
            <p className="game-chip">#{puzzleId + 1}</p>
          </div>
          <div className="header-controls flex items-center gap-3">
            <div className="stream-menu-wrap" ref={streamMenuRef}>
              <button
                aria-controls="stream-menu"
                aria-expanded={showStreamMenu}
                aria-haspopup="menu"
                className={`stream-trigger ${showStreamMenu ? "active" : ""}`}
                onClick={() => setShowStreamMenu((open) => !open)}
                ref={streamTriggerRef}
                type="button"
              >
                <span>{pack.nativeName}</span>
                <b>{category.icon} {category.label}</b>
                <i aria-hidden="true">⌄</i>
              </button>
              {showStreamMenu ? (
                <div aria-label={`${pack.ui.languageLabel} / ${pack.ui.categoryLabel}`} className="stream-menu" id="stream-menu" role="menu">
                  <button
                    aria-label={`${pack.ui.close}: ${pack.ui.languageLabel} / ${pack.ui.categoryLabel}`}
                    className="stream-menu-close"
                    onClick={() => {
                      setShowStreamMenu(false);
                      window.setTimeout(() => streamTriggerRef.current?.focus(), 0);
                    }}
                    type="button"
                  >
                    ✕
                  </button>
                  <span className="stream-menu-label">{pack.ui.languageLabel}</span>
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
                  <span className="stream-menu-label">{pack.ui.categoryLabel}</span>
                  <div className="stream-menu-grid categories">
                    {pack.categories
                      .filter((item) => !item.hidden && isCategoryAvailable(item))
                      .map((item) => (
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
                    {pack.ui.done}
                  </button>
                </div>
              ) : null}
            </div>
            <button
              aria-label={soundOn ? pack.ui.muteSounds : pack.ui.unmuteSounds}
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
              <section
                aria-labelledby="puzzle-clue-label"
                className="puzzle-clue arriving"
                key={`clue-${pack.id}-${category.id}-${puzzleId}`}
              >
                <strong id="puzzle-clue-label">{pack.hintLabel}</strong>
                <p>{answer.clue}</p>
                {answer.clueEnglish ? (
                  <p className="clue-english" lang="en">
                    <span>English:</span> {answer.clueEnglish}
                  </p>
                ) : null}
              </section>
              {showHowTo ? (
                <aside
                  className="game-goal arriving"
                  key={`goal-${pack.id}-${category.id}-${puzzleId}`}
                >
                  <span aria-hidden="true">◎</span>
                  <p><strong>{pack.goal.label}:</strong> {pack.goal.text}</p>
                  <button
                    aria-label={pack.ui.hideInstructions}
                    className="game-goal-close"
                    onClick={() => setShowHowTo(false)}
                    type="button"
                  >
                    ✕
                  </button>
                </aside>
              ) : (
                <button
                  aria-expanded={false}
                  className="how-to-toggle"
                  onClick={() => setShowHowTo(true)}
                  type="button"
                >
                  <span aria-hidden="true">ⓘ</span> {pack.ui.howToPlay}
                </button>
              )}
              <WordDrum
                activeRow={activeRow}
                attemptLabel={pack.attemptLabel}
                copy={pack.ui}
                currentAttempt={currentAttempt}
                key={`drum-${pack.id}-${category.id}-${puzzleId}`}
                rows={drumRows}
                shakeRow={shakeRow}
                showSounds={pack.id === "ml"}
                soundFor={getSound}
                winWaveRow={winWaveRow}
              />

              <p className="status-message mt-4 min-h-7 text-center text-base">
                {message || continuationMessage ||
                  (!gameOver && isFirstTime && state.guesses.length === 0
                    ? pack.ui.startInstruction
                    : "")}
              </p>

              <SlotMachine
                answer={answer.word}
                coach={isFirstTime}
                copy={pack.ui}
                dictionary={guessWordTiles}
                disabled={inputLocked}
                keyboardState={keyboardState}
                positionKeyboardStates={positionKeyboardStates}
                key={`machine-${pack.id}-${category.id}-${puzzleId}`}
                pickerKeys={pickerKeys}
                guideLabels={pack.guide}
                onChange={handleMachineChange}
                presetLetter={answerTiles[0]}
                reelsLabel={`${pack.name} letter reels`}
                showPickerSounds={pack.id === "ml"}
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
                    {copied ? pack.ui.copied : pack.ui.shareResult}
                  </button>
                  <button
                    className="btn-outline px-6 py-3 text-sm uppercase tracking-[0.14em]"
                    onClick={nextPuzzle}
                    type="button"
                  >
                    {pack.ui.nextPuzzle} →
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
              {pack.ui.followUpdates}
              <span aria-hidden="true">→</span>
            </a>
            <FeedbackForm
              category={category.id}
              label={pack.ui.sendFeedback}
              language={pack.id}
              puzzle={puzzleId + 1}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
