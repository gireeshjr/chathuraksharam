"use client";

import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Backdrop from "./components/Backdrop";
import SlotMachine, { MachineEvent } from "./components/SlotMachine";
import WordDrum, { DrumRow } from "./components/WordDrum";
import { buzz, setSfxEnabled, sfx } from "./lib/sfx";

// Keep the answer bank kid-safe: everyday, nature, poetry, school-friendly,
// non-political, non-violent words with learner-friendly clues.
const WORDS = [
  { ml: "കവിതകൾ", manglish: "kavithakal", meaning: "poems", clue: "Words arranged with rhythm and feeling." },
  { ml: "പുലരികൾ", manglish: "pularikal", meaning: "dawns", clue: "The first light of many mornings." },
  { ml: "കനിവുകൾ", manglish: "kanivukal", meaning: "kindnesses", clue: "Small acts of compassion." },
  { ml: "കിരണങ്ങൾ", manglish: "kiranangal", meaning: "rays", clue: "Lines of light from the sun." },
  { ml: "മനസ്സുകൾ", manglish: "manassukal", meaning: "minds", clue: "Places where thoughts and feelings live." },
  { ml: "ദിനകരൻ", manglish: "dinakaran", meaning: "sun", clue: "A poetic word for the day-maker." },
  { ml: "മരങ്ങളിൻ", manglish: "marangalin", meaning: "of trees", clue: "Belonging to trees." },
  { ml: "വഴികളിൽ", manglish: "vazhikalil", meaning: "on paths", clue: "Where people walk or travel." },
  { ml: "നഗരങ്ങൾ", manglish: "nagarangal", meaning: "cities", clue: "Large busy places where many people live." },
  { ml: "വിരലുകൾ", manglish: "viralukal", meaning: "fingers", clue: "You count, touch, and type with them." },
  { ml: "മലരുകൾ", manglish: "malarukal", meaning: "flowers", clue: "Bright blossoms on plants." },
  { ml: "നിറവുകൾ", manglish: "niravukal", meaning: "fullnesses", clue: "A sense of being complete." },
  { ml: "നിലാവുകൾ", manglish: "nilavukal", meaning: "moonlights", clue: "Soft light from the moon." },
  { ml: "അരികുകൾ", manglish: "arikukal", meaning: "edges", clue: "The sides or borders of something." },
  { ml: "പുതുമകൾ", manglish: "puthumakal", meaning: "freshnesses", clue: "Newness, novelty, or fresh qualities." },
  { ml: "തണലുകൾ", manglish: "thanalukal", meaning: "shades", clue: "Cool cover away from sunlight." },
  { ml: "മധുരങ്ങൾ", manglish: "madhurangal", meaning: "sweetnesses", clue: "Pleasant sweet tastes or moments." },
  { ml: "നിഴലുകൾ", manglish: "nizhalukal", meaning: "shadows", clue: "Dark shapes made when light is blocked." },
  { ml: "തരംഗങ്ങൾ", manglish: "tharangangal", meaning: "waves", clue: "Moving rises in water, sound, or feeling." },
  { ml: "ചുവടുകൾ", manglish: "chuvadukal", meaning: "steps", clue: "Footsteps or moves in a sequence." },
  { ml: "വരവുകൾ", manglish: "varavukal", meaning: "arrivals", clue: "Comings or arrivals." },
] as const;

// Broader guess dictionary: every lever pull lands on a real Malayalam word
// that fits the player's locked letters. Answers stay in WORDS; these only
// need to be real, kid-safe, and spellable with the on-screen keys.
const EXTRA_GUESS_WORDS = [
  "കനവുകൾ", // dreams
  "നിനവുകൾ", // remembrances
  "കുരുവികൾ", // sparrows
  "കതകുകൾ", // doors
  "പുഴകളിൽ", // in the rivers
  "തളിരുകൾ", // tender shoots
  "അലകളിൽ", // on the waves
  "കനലുകൾ", // embers
  "നദികളിൽ", // in the rivers
  "വരികളിൽ", // in the lines
  "കനികളിൽ", // in the fruits
  "കരകളിൽ", // on the shores
  "ചുവരുകൾ", // walls
  "ചുമടുകൾ", // loads
  "അകലങ്ങൾ", // distances
  "അരുവികൾ", // streams
  "നിലങ്ങളിൽ", // in the fields
  "ഗണങ്ങളിൽ", // in the groups
  "നടുവിരൽ", // middle finger
  "അണകളിൽ", // at the dams
  "ദിനങ്ങളിൽ", // in the days
  "കരിമണൽ", // black sand
  "കരിനിഴൽ", // dark shadow
  "അരണകൾ", // skinks
  "മറകളിൽ", // behind the covers
  "തറകളിൽ", // on the floors
  "നിരകളിൽ", // in the rows
  "വിലകളിൽ", // in the prices
  "കലകളിൽ", // in the arts
  "കുറവുകൾ", // shortcomings
  "ചുഴികളിൽ", // in the whirlpools
  "വരകളിൽ", // in the drawings
  "പുരങ്ങളിൽ", // in the houses
  "പുരികങ്ങൾ", // eyebrows
  "മലകളിൽ", // on the mountains
  "മരങ്ങളിൽ", // on the trees
  "കിളികളിൽ", // among the birds
] as const;

const KEYBOARD_ROWS = [
  [
    { ml: "ക", sound: "ka" },
    { ml: "പു", sound: "pu" },
    { ml: "നി", sound: "ni" },
    { ml: "വു", sound: "vu" },
    { ml: "മ", sound: "ma" },
    { ml: "വ", sound: "va" },
    { ml: "രി", sound: "ri" },
  ],
  [
    { ml: "ത", sound: "tha" },
    { ml: "ല", sound: "la" },
    { ml: "ര", sound: "ra" },
    { ml: "ങ്ങ", sound: "nga" },
    { ml: "കു", sound: "ku" },
    { ml: "ൻ", sound: "n" },
    { ml: "വി", sound: "vi" },
  ],
  [
    { ml: "ദി", sound: "di" },
    { ml: "ചു", sound: "chu" },
    { ml: "ഴി", sound: "zhi" },
    { ml: "ണ", sound: "na" },
    { ml: "തു", sound: "thu" },
    { ml: "രു", sound: "ru" },
    { ml: "ലു", sound: "lu" },
  ],
  [
    { ml: "അ", sound: "a" },
    { ml: "ഗ", sound: "ga" },
    { ml: "ധു", sound: "dhu" },
    { ml: "രം", sound: "ram" },
    { ml: "ന", sound: "na" },
    { ml: "ടു", sound: "tu" },
    { ml: "ളി", sound: "li" },
  ],
  [
    { ml: "കി", sound: "ki" },
    { ml: "സ്സു", sound: "ssu" },
    { ml: "ൽ", sound: "l" },
    { ml: "റ", sound: "ra" },
    { ml: "ലാ", sound: "laa" },
    { ml: "ഴ", sound: "zha" },
    { ml: "ൾ", sound: "l" },
  ],
] as const;

const MAX_GUESSES = 5;
const WORD_SIZE = 5;
const START_DATE = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;
const STORAGE_KEY = "chathuraksharam-state-v1";
const MODE_KEY = "chathuraksharam-mode-v1";
const SOUND_KEY = "chathuraksharam-sound-v1";
const AUTO_CHECK_DELAY_MS = 1200;

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

type Mode = "fluent" | "learner";
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

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("ml", { granularity: "grapheme" })
    : null;

const allKeys = KEYBOARD_ROWS.flat();

function splitAksharam(word: string) {
  const cleaned = word.trim().replace(/\s+/g, "");
  if (segmenter) {
    return Array.from(segmenter.segment(cleaned), (part) => part.segment);
  }
  return Array.from(cleaned);
}

// Fail the build when any answer or guess word cannot be entered with the
// on-screen keyboard. This keeps the dictionary and keyboard in sync.
const GUESS_WORDS = [...WORDS.map((word) => word.ml), ...EXTRA_GUESS_WORDS];
const keyboardAksharams = new Set<string>(allKeys.map((key) => key.ml));
for (const word of GUESS_WORDS) {
  const tiles = splitAksharam(word);
  if (tiles.length !== WORD_SIZE) {
    throw new Error(
      `Word-bank entry ${word} has ${tiles.length} aksharams; expected ${WORD_SIZE}.`,
    );
  }

  const missingTiles = [...new Set(tiles.filter((tile) => !keyboardAksharams.has(tile)))];
  if (missingTiles.length > 0) {
    throw new Error(
      `Word-bank entry ${word} needs missing keyboard key(s): ${missingTiles.join(", ")}.`,
    );
  }
}

const GUESS_WORD_TILES = GUESS_WORDS.map((word) => splitAksharam(word));

// The puzzle day is anchored to UTC so the server-rendered page and every
// client agree on the same puzzle number (local dates caused hydration
// mismatches whenever the viewer's timezone crossed midnight before UTC).
function getPuzzleId() {
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.floor((todayUtc - START_DATE) / DAY_MS);
}

function getAnswer(puzzleId: number) {
  return WORDS[((puzzleId % WORDS.length) + WORDS.length) % WORDS.length];
}

function getSound(tile: string) {
  return allKeys.find((key) => key.ml === tile)?.sound ?? tile;
}

function evaluateGuess(guess: string, answer: string): TileState[] {
  const guessTiles = splitAksharam(guess);
  const answerTiles = splitAksharam(answer);
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

function getInitialState(puzzleId: number): PersistedState {
  if (typeof window === "undefined") return emptyState(puzzleId);

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
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

function getInitialMode(): Mode {
  if (typeof window === "undefined") return "learner";
  return window.localStorage.getItem(MODE_KEY) === "fluent"
    ? "fluent"
    : "learner";
}

function getShareText(state: PersistedState, answer: (typeof WORDS)[number]) {
  const rows = state.guesses.map((guess) =>
    evaluateGuess(guess, answer.ml)
      .map((tile) =>
        tile === "correct" ? "🟩" : tile === "present" ? "🟨" : "⬛",
      )
      .join(""),
  );
  const score = state.solved ? state.guesses.length : "X";

  return [
    `Chathuraksharam ${state.puzzleId + 1} ${score}/${MAX_GUESSES}`,
    ...rows,
    `🔥 ${state.streak} day streak`,
    "Can you solve today's Malayalam word?",
    window.location.origin,
  ].join("\n");
}

function getCountdown() {
  const now = new Date();
  const nextPuzzleAt = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const remaining = Math.max(0, nextPuzzleAt - now.getTime());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function getKeyboardState(guesses: string[], answer: string) {
  const rank: Record<TileState, number> = {
    empty: 0,
    absent: 1,
    present: 2,
    correct: 3,
  };
  const states = new Map<string, TileState>();

  guesses.forEach((guess) => {
    const tiles = splitAksharam(guess);
    const result = evaluateGuess(guess, answer);

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

function lookupEntries(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return WORDS.slice(0, 5);

  return WORDS.filter((word) =>
    [word.ml, word.manglish, word.meaning, word.clue].some((field) =>
      field.toLowerCase().includes(normalized),
    ),
  ).slice(0, 5);
}

export default function Home() {
  const puzzleId = useMemo(() => getPuzzleId(), []);
  const answer = useMemo(() => getAnswer(puzzleId), [puzzleId]);
  const answerTiles = useMemo(() => splitAksharam(answer.ml), [answer]);
  const [state, setState] = useState<PersistedState>(() => emptyState(puzzleId));
  // The hinted first letter starts locked in, so it previews on the board.
  const [preview, setPreview] = useState<string[]>(() => [
    answerTiles[0],
    ...Array(WORD_SIZE - 1).fill(""),
  ]);
  const [message, setMessage] = useState(
    "The first letter is locked in for you — dial or spin the rest.",
  );
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("learner");
  const [lookup, setLookup] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [countdown, setCountdown] = useState(getCountdown);
  const [settledCount, setSettledCount] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [winWaveRow, setWinWaveRow] = useState<number | null>(null);
  const [shakeRow, setShakeRow] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const timeoutsRef = useRef<number[]>([]);
  const autoCheckRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const isLearner = mode === "learner";
  const gameOver = state.solved || state.guesses.length >= MAX_GUESSES;
  const inputLocked = gameOver || revealing;
  const roundOver = gameOver && !revealing;
  const settledGuesses = useMemo(
    () => state.guesses.slice(0, settledCount),
    [state.guesses, settledCount],
  );
  const keyboardState = useMemo(
    () => getKeyboardState(settledGuesses, answer.ml),
    [answer, settledGuesses],
  );
  const lookupResults = useMemo(() => lookupEntries(lookup), [lookup]);
  const winRate =
    state.played > 0 ? Math.round((state.wins / state.played) * 100) : 0;

  // The drum face the player is on. While a reveal is running the drum must
  // hold the revealing row, and once the game ends it stays on the final
  // guess instead of rolling to an empty face.
  const activeRow =
    revealing || gameOver
      ? Math.max(0, state.guesses.length - 1)
      : Math.min(state.guesses.length, MAX_GUESSES - 1);

  const drumRows = useMemo<DrumRow[]>(
    () =>
      Array.from({ length: MAX_GUESSES }, (_, rowIndex) => {
        const guess = state.guesses[rowIndex];
        const isActiveEntry =
          !guess && rowIndex === state.guesses.length && !gameOver;
        const raw = guess ? splitAksharam(guess) : isActiveEntry ? preview : [];
        const tiles = Array.from(
          { length: WORD_SIZE },
          (_, index) => raw[index] ?? "",
        );
        return {
          tiles,
          result: guess
            ? evaluateGuess(guess, answer.ml)
            : Array(WORD_SIZE).fill("empty" as TileState),
          phase: guess
            ? rowIndex < settledCount
              ? ("settled" as const)
              : ("reveal" as const)
            : ("idle" as const),
        };
      }),
    [answer, gameOver, preview, settledCount, state.guesses],
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
    const initial = getInitialState(puzzleId);
    setState(initial);
    setSettledCount(initial.guesses.length);
    setMode(getInitialMode());
    const savedSound = window.localStorage.getItem(SOUND_KEY) !== "off";
    setSoundOn(savedSound);
    setSfxEnabled(savedSound);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [puzzleId]);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.localStorage.setItem(MODE_KEY, mode);
    }
  }, [hydrated, mode, state]);

  useEffect(() => {
    if (!showConfetti) return;

    const timeout = window.setTimeout(() => setShowConfetti(false), 3400);
    return () => window.clearTimeout(timeout);
  }, [showConfetti]);

  useEffect(() => {
    const interval = window.setInterval(() => setCountdown(getCountdown()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

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
  }

  function updateMode(nextMode: Mode) {
    setMode(nextMode);
    setCopied(false);
    setMessage(
      nextMode === "learner"
        ? "Learner mode shows Manglish sounds under each Malayalam aksharam."
        : "Fluent mode keeps the board compact and Malayalam-first.",
    );
  }

  // All five reels locked → the check fires after a short beat; unlocking
  // any reel inside that window cancels it.
  function handleMachineChange(
    letters: string[],
    locked: boolean[],
    event: MachineEvent,
  ) {
    setPreview(letters.map((letter, index) => (locked[index] ? letter : "")));

    if (autoCheckRef.current !== null) {
      window.clearTimeout(autoCheckRef.current);
      autoCheckRef.current = null;
      if (event === "unlock") {
        setMessage("Unlocked. Pull again, or lock all five to check.");
      }
    }

    if (event === "land") {
      setMessage(
        "The reels spell a real word — lock what you like, or pull again.",
      );
      return;
    }

    if (event === "freespin") {
      setMessage(
        "No dictionary word fits your locked letters — that was a free spin.",
      );
      return;
    }

    if (event === "lock" && locked.every(Boolean)) {
      setMessage("All five locked! Checking…");
      autoCheckRef.current = window.setTimeout(() => {
        autoCheckRef.current = null;
        submitWord(letters.join(""));
      }, AUTO_CHECK_DELAY_MS);
    }
  }

  function submitWord(word: string) {
    if (inputLocked) return;

    const normalized = splitAksharam(word).join("");
    const tiles = splitAksharam(normalized);

    if (tiles.length !== WORD_SIZE) {
      setMessage(`Enter exactly ${WORD_SIZE} Malayalam aksharams.`);
      setShakeRow(true);
      sfx.invalid();
      buzz(60);
      later(() => setShakeRow(false), 520);
      return;
    }

    const rowIndex = state.guesses.length;
    const solved = normalized === answer.ml;
    const finalTry = rowIndex + 1 >= MAX_GUESSES;
    const finished = solved || finalTry;

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
    setPreview([answerTiles[0], ...Array(WORD_SIZE - 1).fill("")]);
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
        setWinWaveRow(rowIndex);
        setShowConfetti(true);
        sfx.win();
        buzz([28, 40, 28, 40, 60]);
        setMessage(
          `Correct: ${answer.ml} (${answer.manglish}) means "${answer.meaning}".`,
        );
        later(() => setShowResultModal(true), 1350);
      } else if (finalTry) {
        sfx.lose();
        buzz(90);
        setMessage(
          `Today's answer was ${answer.ml} (${answer.manglish}), meaning "${answer.meaning}".`,
        );
        later(() => setShowResultModal(true), 750);
      } else {
        setMessage("The reels are unlocked — pull the lever for fresh letters.");
        later(() => sfx.roll(), 180);
      }
    }, REVEAL_TOTAL_MS + 60);
  }

  async function shareResult() {
    const text = getShareText(state, answer);
    try {
      if (navigator.share) {
        await navigator.share({ text, title: "Chathuraksharam" });
        setMessage("Result shared.");
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setMessage("Result copied.");
      }
    } catch {
      setMessage("Sharing was cancelled.");
    }
  }

  function addDailyReminder() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    const stamp = tomorrow.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Chathuraksharam//Daily Puzzle//EN",
      "BEGIN:VEVENT",
      `DTSTART:${stamp}`,
      "RRULE:FREQ=DAILY",
      "SUMMARY:Play today's Chathuraksharam",
      `DESCRIPTION:A new Malayalam word puzzle is ready. ${window.location.origin}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "chathuraksharam-daily-reminder.ics";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Daily calendar reminder downloaded.");
  }

  return (
    <main className="game-main">
      <Backdrop />
      {showConfetti ? (
        <div className="confetti-burst" aria-hidden="true">
          {CONFETTI_PIECES.map((piece, index) => (
            <span
              className="confetti-piece"
              key={`confetti-${index}`}
              style={{
                "--confetti-delay": piece.delay,
                "--confetti-drift": piece.drift,
                "--confetti-left": piece.left,
                "--confetti-rotation": piece.rotation,
                "--confetti-spin": piece.spin,
              } as CSSProperties}
            />
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
            <p className="result-eyebrow">Puzzle #{puzzleId + 1}</p>
            <h2 className="result-title mt-2 text-3xl" id="result-title">
              {state.solved ? "You got it!" : "Puzzle complete"}
            </h2>
            <p className="result-score mt-2 text-lg">
              {state.solved ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`} · 🔥 {state.streak}
            </p>
            <div aria-label="Spoiler-free result" className="mt-4 space-y-1 text-xl leading-none">
              {state.guesses.map((guess, index) => (
                <p key={`${guess}-${index}`}>
                  {evaluateGuess(guess, answer.ml)
                    .map((tile) => tile === "correct" ? "🟩" : tile === "present" ? "🟨" : "⬛")
                    .join("")}
                </p>
              ))}
            </div>
            <p className="result-meaning mt-3 text-base leading-7">
              <strong>{answer.ml}</strong> ({answer.manglish}) means “{answer.meaning}”.
            </p>
            <p className="result-countdown mt-3 text-sm">
              Next puzzle in {countdown}
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
              className="btn-outline mt-3 w-full px-5 py-3"
              onClick={addDailyReminder}
              type="button"
            >
              Add daily reminder
            </button>
          </div>
        </div>
      ) : null}
      <section className="site-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="game-header flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="title-block flex items-center gap-3">
            <div>
              <h1 className="game-title">Chathuraksharam</h1>
              <p className="game-title-ml" aria-hidden="true">ചതുരക്ഷരം</p>
            </div>
            <p className="game-chip">#{puzzleId + 1} · 5×5</p>
          </div>
          <div className="header-controls flex items-center gap-3">
            <button
              aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
              aria-pressed={soundOn}
              className="sound-toggle"
              onClick={toggleSound}
              type="button"
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
            <div className="mode-switch" aria-label="Choose play mode">
              <button
                className={mode === "fluent" ? "active" : ""}
                onClick={() => updateMode("fluent")}
                type="button"
              >
                I know Malayalam
              </button>
              <button
                className={mode === "learner" ? "active" : ""}
                onClick={() => updateMode("learner")}
                type="button"
              >
                I am learning Malayalam
              </button>
            </div>
          </div>
        </header>

        <div className="game-layout grid flex-1 items-start justify-center gap-8 py-6 lg:grid-cols-[minmax(0,620px)_300px]">
          <div className="tilt-stage" ref={stageRef}>
            <section
              aria-label="Malayalam word puzzle"
              className="puzzle-panel tilt-body mx-auto w-full max-w-xl"
            >
              <div className="puzzle-intro mb-4">
                <div>
                  <p className="intro-eyebrow">Puzzle #{puzzleId + 1}</p>
                  <p className="intro-copy mt-1">
                    Guess the five-aksharam Malayalam word in five tries. Pull
                    the lever to spin letters, or dial each reel like a
                    combination lock. Lock the ones you want — lock all five
                    and the word is checked.
                  </p>
                </div>
                {isLearner ? (
                  <p className="sound-note">
                    Small text under each Malayalam letter shows its Manglish
                    sound.
                  </p>
                ) : null}
              </div>

              <div className="hint-card depth-panel">
                <div>
                  <h2 className="hint-heading">Today&apos;s hint</h2>
                  <p className="hint-copy mt-1">
                    Meaning clue: {answer.clue}
                  </p>
                </div>
              </div>

              <WordDrum
                activeRow={activeRow}
                mode={mode}
                rows={drumRows}
                shakeRow={shakeRow}
                soundFor={getSound}
                winWaveRow={winWaveRow}
              />

              <p className="status-message mt-4 min-h-7 text-center text-base">
                {message}
              </p>

              <SlotMachine
                dictionary={GUESS_WORD_TILES}
                disabled={inputLocked}
                keyboardState={keyboardState}
                keys={allKeys}
                learner={isLearner}
                onChange={handleMachineChange}
                presetLetter={answerTiles[0]}
                roundKey={state.guesses.length}
                usedWords={state.guesses}
              />

              {roundOver ? (
                <div className="mt-4 flex justify-center">
                  <button
                    className="btn-primary px-6 py-3 text-sm uppercase tracking-[0.14em]"
                    onClick={shareResult}
                    type="button"
                  >
                    {copied ? "Copied" : "Share result"}
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="space-y-5">
            <div className="help-card depth-panel p-5">
              <h2 className="panel-heading">How to play</h2>
              <p className="panel-copy mt-2">
                Find today&apos;s five-aksharam Malayalam word. The hinted
                first letter starts locked in for you. Pull the lever and the
                reels spin, or dial a reel yourself — drag it, or tap the
                ▲▼ arrows like a suitcase lock. The lever always lands on a
                real Malayalam word that fits your locked letters when one
                exists. Tap a letter to lock it; when all five are locked, the
                word is checked. Green means the aksharam is in the right
                spot, gold means it is in the word, and dark means it is not
                used. Guess in five tries.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="stat">
                <strong>{state.played}</strong>
                <span>Played</span>
              </div>
              <div className="stat">
                <strong>{winRate}%</strong>
                <span>Win rate</span>
              </div>
              <div className="stat">
                <strong>{state.streak}</strong>
                <span>Streak</span>
              </div>
            </div>

            {isLearner ? (
              <div className="depth-panel p-5">
                <h2 className="panel-heading">Learner lookup</h2>
                <p className="panel-copy mt-2">
                  Search an English meaning or Manglish sound from the word
                  bank.
                </p>
                <input
                  aria-label="Search English or Manglish"
                  className="lookup-input mt-3 w-full px-3 py-2 text-sm"
                  onChange={(event) => setLookup(event.target.value)}
                  placeholder="Try: flowers, waves, nilavu"
                  value={lookup}
                />
                <div className="lookup-list">
                  {lookupResults.map((word) => (
                    <div className="lookup-item" key={word.ml}>
                      <strong>{word.meaning}</strong>
                      <span>{word.manglish}</span>
                      <b>{word.ml}</b>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

          </aside>
        </div>
      </section>
    </main>
  );
}
