"use client";

import {
  CSSProperties,
  memo,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buzz, sfx } from "../lib/sfx";
import { getEligibleSpinWords } from "../lib/spin.mjs";

type KeyDef = { ml: string; sound: string };
type TileState = "correct" | "present" | "absent" | "empty";
type ReelMotion = "idle" | "spin" | "snap";
type GuideStep = "pick" | "check" | null;

export type MachineEvent = "land" | "freespin" | "lock" | "dial" | "picker";

const REEL_COUNT = 5;
// Enough runway for the farthest-travelling reel: a spin adds one full loop
// plus almost a full alphabet of approach from the resting copy, so the
// strip must hold at least 4 alphabet copies or it scrolls into blank
// space. Keeping the strip short matters: each reel is one big composited
// layer, and tall strips pushed mobile Safari into memory-pressure page
// reloads mid-game.
const STRIP_COPIES = 4;
const INITIAL_OFFSETS = [0, 7, 14, 21, 28];

type MachineCopy = {
  checking: string;
  checkWord: string;
  closePicker: string;
  pickerGroup: string;
  pickerShortcutsAria: string;
  pickerTitle: string;
  pull: string;
  pullAria: string;
  pullShortcut: string;
  reelLabel: string;
  reelAction: string;
  reelLocked: string;
};

function withNumber(template: string, number: number) {
  return template.replace("{number}", String(number));
}

function spinWeight(state: TileState | undefined) {
  // Lever luck is weighted: letters proven absent become rare and letters
  // known to be in the word come up ~3x more often, so pulls feel like
  // progress. Return 1 for everything to make the odds uniform.
  if (state === "absent") return 0.2;
  if (state === "correct" || state === "present") return 3;
  return 1;
}

// Event-handler-only helpers (never called during render).
function pickTargetIndex(
  reelSeq: KeyDef[],
  keyboardState: Map<string, TileState>,
) {
  const weights = reelSeq.map((key) => spinWeight(keyboardState.get(key.ml)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

// The lever prefers real words. `excludedWord` protects the first pull from
// landing on the answer; later pulls include it as an ordinary candidate.
function pickSpinTargets(
  reelSeq: KeyDef[],
  keyboardState: Map<string, TileState>,
  dictionary: ReadonlyArray<ReadonlyArray<string>>,
  lockedPattern: (string | null)[],
  usedWords: ReadonlySet<string>,
  excludedWord: string | null,
): { targets: number[]; freespin: boolean; word: string | null } {
  const seqIndex = new Map(reelSeq.map((key, index) => [key.ml, index]));
  const candidates = getEligibleSpinWords(
    dictionary,
    new Set(seqIndex.keys()),
    lockedPattern,
    usedWords,
    excludedWord,
  );

  if (candidates.length > 0) {
    const word = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      freespin: false,
      word: word.join(""),
      targets: word.map((tile, i) =>
        lockedPattern[i] ? -1 : seqIndex.get(tile)!,
      ),
    };
  }

  return {
    freespin: true,
    word: null,
    targets: lockedPattern.map((lockedTile) =>
      lockedTile ? -1 : pickTargetIndex(reelSeq, keyboardState),
    ),
  };
}

// Crisp vector padlock (emoji locks rasterise blurry at button sizes).
// Stroke follows currentColor, so the button's color states style it.
function LockIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="lock-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect
        fill="currentColor"
        fillOpacity="0.16"
        height="10"
        rx="2.5"
        width="16"
        x="4"
        y="11"
      />
      {open ? (
        <path d="M8 11V7a4 4 0 0 1 7.8-1.3" />
      ) : (
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      )}
      <circle cx="12" cy="16" fill="currentColor" r="1.4" stroke="none" />
    </svg>
  );
}

// The strip letters never change while playing (only the wrapper transform
// does), but they are by far the most DOM in the app — STRIP_COPIES copies of
// the alphabet per reel. Memoising them keeps every positions/drag/lock state
// change from reconciling thousands of spans, which visibly froze mobile.
const ReelStripItems = memo(function ReelStripItems({
  reelSeq,
  showSounds,
}: {
  reelSeq: KeyDef[];
  showSounds: boolean;
}) {
  return (
    <>
      {Array.from({ length: STRIP_COPIES }, (_, copy) =>
        reelSeq.map((item, idx) => (
          <span
            aria-hidden={copy > 0}
            className="reel-item"
            key={`${copy}-${idx}`}
          >
            <span className="reel-symbol">{item.ml}</span>
            {showSounds ? (
              <span className="reel-sound">{item.sound}</span>
            ) : null}
          </span>
        )),
      )}
    </>
  );
});

export default function SlotMachine({
  pickerKeys,
  keyboardState,
  positionKeyboardStates,
  disabled,
  roundKey,
  presetLetter,
  dictionary,
  usedWords,
  answer,
  coach,
  copy,
  guideLabels,
  reelsLabel,
  showPickerSounds,
  onChange,
}: {
  /** Stable, language-natural order shared by the reels and letter picker. */
  pickerKeys: ReadonlyArray<KeyDef>;
  keyboardState: Map<string, TileState>;
  /** Letter knowledge scoped to each reel position. */
  positionKeyboardStates: ReadonlyArray<Map<string, TileState>>;
  disabled: boolean;
  roundKey: string;
  /** The hinted first aksharam: reel 1 starts on it, but remains unlocked. */
  presetLetter?: string;
  /** Guess dictionary as pre-split aksharam arrays; pulls land on these. */
  dictionary: ReadonlyArray<ReadonlyArray<string>>;
  /** Words already guessed this round — pulls avoid repeating them. */
  usedWords: ReadonlyArray<string>;
  /** The lever must never give away the solution. */
  answer: string;
  /** Show the short, progressive coach only for a player's first game. */
  coach: boolean;
  copy: MachineCopy;
  guideLabels: { lock: string; pick: string };
  reelsLabel: string;
  /** Show Latin sound guides beneath non-Latin picker symbols. */
  showPickerSounds?: boolean;
  onChange: (letters: string[], locked: boolean[], event: MachineEvent) => void;
}) {
  // Manual dialing follows the same natural alphabet order shown in the
  // picker. Each reel starts at a different offset, but one swipe always
  // advances to the adjacent visible picker letter, with wraparound.
  const reelSeq = useMemo(() => [...pickerKeys], [pickerKeys]);
  const seqLength = reelSeq.length;
  const presetIndex = useMemo(
    () =>
      presetLetter
        ? reelSeq.findIndex((key) => key.ml === presetLetter)
        : -1,
    [presetLetter, reelSeq],
  );

  // Reels rest inside the second alphabet copy: one copy of runway above
  // for upward dials, and (STRIP_COPIES - 2) copies below for the spin.
  const initialPositions = useMemo(
    () =>
      INITIAL_OFFSETS.map((offset, i) =>
        i === 0 && presetIndex >= 0
          ? seqLength + presetIndex
          : seqLength + (offset % seqLength),
      ),
    [presetIndex, seqLength],
  );
  const initialLocked = useMemo(
    () => Array(REEL_COUNT).fill(false),
    [],
  );

  // positions[i] is an index into the repeated strip; the visible letter is
  // reelSeq[position mod seqLength]. Kept within the middle copies.
  const [positions, setPositions] = useState<number[]>(() => initialPositions);
  const [locked, setLocked] = useState<boolean[]>(() => initialLocked);
  const [motion, setMotion] = useState<ReelMotion[]>(() =>
    Array(REEL_COUNT).fill("idle"),
  );
  const [dragReel, setDragReel] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState(0);
  const [pickerReel, setPickerReel] = useState<number | null>(null);
  const [leverPulled, setLeverPulled] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [guideStep, setGuideStep] = useState<GuideStep>(null);
  const reelButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timeouts = useRef<number[]>([]);
  const dragRef = useRef<{
    reel: number;
    startY: number;
    startPos: number;
    itemHeight: number;
    moved: number;
    live: number;
  } | null>(null);
  // These refs live for the keyed puzzle component, so they persist across
  // submitted guesses but reset when the language, category, or puzzle does.
  const landedWords = useRef<Set<string>>(new Set());
  const puzzlePullCount = useRef(0);
  const rafRef = useRef(0);
  const positionsRef = useRef(positions);
  const spinning = motion.some((m) => m === "spin");

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const later = (fn: () => void, ms: number) => {
    timeouts.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    const pending = timeouts.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Reset the complete machine before paint whenever the stream, puzzle, or
  // guess round changes. Guess count alone is not a unique round identity:
  // every newly selected language/category starts at zero too.
  useLayoutEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const nextPositions = [...initialPositions];
    positionsRef.current = nextPositions;
    setPositions(nextPositions);
    setLocked([...initialLocked]);
    setMotion(Array(REEL_COUNT).fill("idle"));
    setDragReel(null);
    setPickerReel(null);
    setLeverPulled(false);
    setInteracted(false);
    setGuideStep(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialLocked, initialPositions, roundKey]);

  const normalize = (p: number) =>
    seqLength + ((Math.round(p) % seqLength) + seqLength) % seqLength;

  const letterAt = (position: number) =>
    reelSeq[((Math.round(position) % seqLength) + seqLength) % seqLength];

  const currentLetters = positions.map((p) => letterAt(p).ml);

  function setReelMotion(index: number, value: ReelMotion) {
    setMotion((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  // The lever is a pointer gesture, not a click: grab on pointerdown (with
  // capture, so dragging downward keeps the events even though the page
  // could scroll), spin on release. Click only fires it for keyboard
  // activation (detail === 0), so pointer input never double-pulls.
  const leverHeld = useRef(false);

  const onLeverPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    leverHeld.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setLeverPulled(true);
  };

  const onLeverRelease = (fire: boolean) => {
    if (!leverHeld.current) return;
    leverHeld.current = false;
    setLeverPulled(false);
    if (fire) pullLever();
  };

  // Disabled mid-hold (e.g. the auto-check fires) means no pointerup ever
  // arrives on the button, so un-pull the knob during render like the
  // roundKey reset above. leverHeld needs no reset: the next interaction
  // always begins with a pointerdown that sets it.
  const [prevDisabled, setPrevDisabled] = useState(disabled);
  if (prevDisabled !== disabled) {
    setPrevDisabled(disabled);
    if (disabled) {
      setLeverPulled(false);
      setPickerReel(null);
    }
  }

  function pullLever() {
    if (disabled || spinning || dragReel !== null) return;
    if (locked.every(Boolean)) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    setLeverPulled(true);
    setGuideStep(null);
    later(() => setLeverPulled(false), 620);
    setInteracted(true);
    sfx.crank();
    buzz([14, 30, 14]);

    const lockedPattern = Array(REEL_COUNT).fill(null);
    // The first pull can never solve the puzzle by itself. Starting with the
    // second pull, the answer joins the same pool as every other word.
    const excludedAnswer = puzzlePullCount.current === 0 ? answer : null;
    puzzlePullCount.current += 1;

    // Pulls avoid words this puzzle's lever already landed on; a word only
    // repeats once every other fitting word has been shown across all tries.
    const guessed = new Set(usedWords);
    let pick = pickSpinTargets(
      reelSeq,
      keyboardState,
      dictionary,
      lockedPattern,
      new Set([...guessed, ...landedWords.current]),
      excludedAnswer,
    );
    if (pick.freespin) {
      // Either every fitting word has been landed on (start the cycle
      // over) or none fits at all (genuine free spin — keep the memory).
      const retry = pickSpinTargets(
        reelSeq,
        keyboardState,
        dictionary,
        lockedPattern,
        guessed,
        excludedAnswer,
      );
      if (!retry.freespin) {
        landedWords.current.clear();
        pick = retry;
      }
    }
    let { targets, freespin } = pick;
    // A free spin is random rather than dictionary-backed. Guard its tiny
    // chance of spelling the answer by nudging the final reel one step.
    if (
      freespin &&
      targets.map((target) => reelSeq[target]?.ml).join("") === answer
    ) {
      targets = [...targets];
      targets[REEL_COUNT - 1] = (targets[REEL_COUNT - 1] + 1) % seqLength;
      freespin = true;
    }
    if (pick.word) landedWords.current.add(pick.word);

    const nextPositions = [...positions];
    setMotion(positions.map(() => "spin"));

    let lastLand = 0;
    positions.forEach((position, i) => {
      const target = targets[i];
      const base = ((Math.round(position) % seqLength) + seqLength) % seqLength;
      const forward = (target - base + seqLength) % seqLength;
      // Every reel loops exactly once; the landing stagger comes from the
      // duration ramp. More loops would need a longer (heavier) strip.
      const loops = reducedMotion ? 0 : 1;
      nextPositions[i] = Math.round(position) + loops * seqLength + forward;

      const duration = reducedMotion ? 30 : 820 + i * 240;
      lastLand = Math.max(lastLand, duration);
      later(() => {
        sfx.thunk(i);
        setReelMotion(i, "idle");
      }, duration + 60);
    });

    setPositions(nextPositions);
    later(() => {
      // Return to the middle copies so the next spin never runs out of
      // strip; the modulo keeps the same letter on screen.
      setPositions((current) => current.map((p) => normalize(p)));
      const letters = nextPositions.map((p) => letterAt(p).ml);
      onChange(letters, locked, freespin ? "freespin" : "land");
      if (coach) setGuideStep("pick");
    }, lastLand + 120);
  }

  // ------------------------------------------------------------------
  // Direct letter picking (per-reel keyboard) and vertical drags.
  // ------------------------------------------------------------------

  function showPicker(index: number) {
    if (disabled || spinning || locked[index]) return;
    if (pickerReel === index) return; // already targeted — stays open
    if (coach) setGuideStep("pick");
    sfx.key();
    setPickerReel(index);
    onChange(currentLetters, locked, "picker");
  }

  function closePicker(restoreFocus = true) {
    const index = pickerReel;
    setPickerReel(null);
    if (restoreFocus && index !== null) {
      window.setTimeout(() => reelButtonRefs.current[index]?.focus(), 0);
    }
  }

  function openPicker(index: number) {
    if (dragReel !== null) return;
    showPicker(index);
  }

  // The callout points an arrow at its reel; keep the caret under the
  // reel's centre as the target changes or the layout resizes. Direct
  // style mutation, so retargeting never re-renders the strips.
  const machineRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (pickerReel === null) return;
    const position = () => {
      const machine = machineRef.current;
      const caret = caretRef.current;
      const reel = machine?.querySelectorAll(".reel-col")[pickerReel];
      if (!machine || !caret || !reel) return;
      const machineBox = machine.getBoundingClientRect();
      const reelBox = reel.getBoundingClientRect();
      caret.style.left = `${
        reelBox.left + reelBox.width / 2 - machineBox.left
      }px`;
    };
    position();
    window.addEventListener("resize", position);
    // The callout renders below the machine, often past the fold on
    // phones — bring it into view whenever it opens or retargets.
    machineRef.current
      ?.querySelector(".picker-pop")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return () => window.removeEventListener("resize", position);
  }, [pickerReel]);

  function pickLetter(
    letter: string,
    advance = true,
    advanceImmediately = false,
  ) {
    const index = pickerReel;
    if (index === null || disabled || spinning || locked[index]) return;
    const target = reelSeq.findIndex((key) => key.ml === letter);
    if (target < 0) return;

    setInteracted(true);
    if (coach) setGuideStep("check");
    sfx.tick();
    buzz(6);
    if (advance && advanceImmediately) {
      setPickerReel(index < REEL_COUNT - 1 ? index + 1 : null);
    }

    // Snap along the shortest path so the reel visibly rolls to the pick.
    const current = Math.round(positions[index]);
    const base = ((current % seqLength) + seqLength) % seqLength;
    let delta = target - base;
    if (delta > seqLength / 2) delta -= seqLength;
    if (delta < -seqLength / 2) delta += seqLength;
    if (delta === 0) {
      onChange(currentLetters, locked, "dial");
      if (advance && !advanceImmediately) {
        setPickerReel(index < REEL_COUNT - 1 ? index + 1 : null);
      }
      return;
    }

    const next = [...positions];
    next[index] = current + delta;
    setReelMotion(index, "snap");
    setPositions(next);
    later(() => {
      setReelMotion(index, "idle");
      setPositions((settled) => {
        const done = [...settled];
        done[index] = normalize(done[index]);
        return done;
      });
      onChange(next.map((p) => letterAt(p).ml), locked, "dial");
      if (advance && !advanceImmediately) {
        setPickerReel(index < REEL_COUNT - 1 ? index + 1 : null);
      }
    }, 170);
  }

  useEffect(() => {
    if (pickerReel === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        document.querySelector(".stream-menu") ||
        target?.closest("input, textarea, select, [contenteditable='true'], .stream-menu")
      ) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closePicker(true);
        return;
      }

      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault();
        showPicker(Number(event.key) - 1);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        showPicker((pickerReel + direction + REEL_COUNT) % REEL_COUNT);
        return;
      }

      const activeLetter = letterAt(positions[pickerReel]).ml;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const current = Math.max(0, pickerKeys.findIndex((key) => key.ml === activeLetter));
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const next = (current + direction + pickerKeys.length) % pickerKeys.length;
        pickLetter(pickerKeys[next].ml, false);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        pickLetter(activeLetter);
        return;
      }

      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const typed = event.key.toLocaleLowerCase();
        const exactMatches = pickerKeys.filter(
          (key) =>
            key.ml.toLocaleLowerCase() === typed ||
            key.sound.toLocaleLowerCase() === typed,
        );
        const matches = exactMatches.length > 0
          ? exactMatches
          : pickerKeys.filter((key) =>
              key.sound.toLocaleLowerCase().startsWith(typed),
            );
        if (matches.length > 0) {
          event.preventDefault();
          const currentMatch = matches.findIndex((key) => key.ml === activeLetter);
          const unambiguous = matches.length === 1;
          pickLetter(
            matches[(currentMatch + 1) % matches.length].ml,
            unambiguous,
            unambiguous,
          );
        }
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".picker-pop, .reel-dial")) closePicker(false);
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
    // Handlers intentionally refresh with live reel and picker state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerKeys, pickerReel, positions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        disabled ||
        spinning ||
        pickerReel !== null ||
        document.querySelector(".stream-menu") ||
        target?.closest("input, textarea, select, [contenteditable='true'], .stream-menu")
      ) return;

      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault();
        showPicker(Number(event.key) - 1);
      } else if (event.code === "Space" && !target?.closest("button, a")) {
        event.preventDefault();
        pullLever();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Handler intentionally refreshes with live machine state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, pickerReel, positions, spinning]);

  const onDialPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (disabled || spinning || locked[index]) return;
    const window_ = event.currentTarget.querySelector(".reel-window");
    const height = window_
      ? window_.getBoundingClientRect().height / 3
      : 58;
    dragRef.current = {
      reel: index,
      startY: event.clientY,
      startPos: positions[index],
      itemHeight: height,
      moved: 0,
      live: positions[index],
    };
    setDragReel(index);
    setDragPos(positions[index]);
    // No pointer capture: it would interfere with the dial's completed click
    // and the separate submit control.
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dy = event.clientY - drag.startY;
      drag.moved = Math.max(drag.moved, Math.abs(dy));
      // Dragging down pulls earlier letters into view, like rolling a
      // suitcase dial toward you.
      const live = Math.min(
        (STRIP_COPIES - 1) * seqLength - 2,
        Math.max(2, drag.startPos - dy / drag.itemHeight),
      );
      drag.live = live;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setDragPos(live));
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const index = drag.reel;
      setDragReel(null);

      // Treat the gesture as a tap unless it actually reached another
      // letter. A strict pixel slop misclassified real taps as drags on
      // touchscreens (finger wobble grows when the main thread is busy),
      // which made lock taps silently miss.
      const isTap =
        Math.round(drag.live) === Math.round(drag.startPos) &&
        drag.moved < drag.itemHeight * 0.45;
      if (isTap) {
        // Open directly from the completed pointer gesture. Waiting for the
        // browser's subsequent click was unreliable after the pointerdown
        // state update, especially on touch devices.
        showPicker(index);
      } else {
        setInteracted(true);
        if (coach) setGuideStep("check");
        sfx.tick();
        buzz(6);
        const snapped = Math.round(drag.live);
        setReelMotion(index, "snap");
        setPositions((current) => {
          const next = [...current];
          next[index] = snapped;
          return next;
        });
        later(() => {
          setReelMotion(index, "idle");
          const settled = [...positionsRef.current];
          settled[index] = normalize(settled[index]);
          setPositions(settled);
          onChange(settled.map((p) => letterAt(p).ml), locked, "dial");
        }, 170);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // letterAt/normalize are stable per reelSeq. The interaction-state
    // dependencies ensure a new attempt cannot retain the disabled reveal
    // state in this window-level pointer handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, locked, pickerReel, seqLength, spinning]);

  function submitAllLocks() {
    if (
      disabled ||
      spinning ||
      locked.every(Boolean) ||
      !interacted ||
      pickerReel !== null
    ) return;

    const next = Array(REEL_COUNT).fill(true);
    setLocked(next);
    setGuideStep(null);
    setPickerReel(null);
    sfx.lock();
    buzz(12);
    onChange(currentLetters, next, "lock");
  }

  const allLocked = locked.every(Boolean);
  const readyToCheck = interacted && pickerReel === null && !spinning && !allLocked;

  return (
    <div
      aria-label={reelsLabel}
      className="machine"
      ref={machineRef}
      role="group"
    >
      <div className="machine-body">
        <div className={`reel-bank ${guideStep === "pick" ? "coach-target" : ""}`}>
          {positions.map((position, i) => {
            const displayed = dragReel === i ? dragPos : position;
            const key = letterAt(displayed);
            const status = positionKeyboardStates[i]?.get(key.ml) ?? "empty";
            const reelMotion = motion[i];
            const transition =
              dragReel === i || reelMotion === "idle"
                ? "none"
                : reelMotion === "spin"
                  ? `transform ${820 + i * 240}ms cubic-bezier(0.18, 0.7, 0.3, 1.08)`
                  : "transform 160ms cubic-bezier(0.3, 1.3, 0.5, 1)";
            const isTarget = pickerReel === i;
            return (
              <div
                className="reel-col"
                key={i}
                style={
                  // Inline: the editing highlight must survive any CSS
                  // cascade or stale-stylesheet situation. While the
                  // picker is open, every other reel dims.
                  pickerReel !== null && !isTarget
                    ? { opacity: 0.45 }
                    : undefined
                }
              >
                <div
                  className={`reel ${locked[i] ? "locked" : ""} ${
                    isTarget ? "targeted" : ""
                  } ${reelMotion === "spin" ? "spinning" : ""} status-${status}`}
                  style={
                    isTarget
                      ? {
                          borderColor: "#1fb47d",
                          boxShadow: "0 0 18px rgba(31, 180, 125, 0.45)",
                          outline: "2px solid #1fb47d",
                          outlineOffset: "1.5px",
                        }
                      : undefined
                  }
                >
                  <button
                    aria-label={`${withNumber(copy.reelLabel, i + 1)}: ${key.ml}, ${key.sound}. ${
                      locked[i]
                        ? copy.reelLocked
                        : copy.reelAction
                    }`}
                    className="reel-dial"
                    disabled={disabled}
                    onClick={(event) => {
                      // Pointer taps open from the completed dial gesture;
                      // click remains the keyboard activation path.
                      if (event.detail === 0) openPicker(i);
                    }}
                    onPointerDown={(event) => onDialPointerDown(event, i)}
                    ref={(element) => {
                      reelButtonRefs.current[i] = element;
                    }}
                    title={`${withNumber(copy.reelLabel, i + 1)} — ${copy.reelAction}`}
                    type="button"
                  >
                    <div className="reel-window">
                      <div
                        className="reel-strip"
                        style={
                          {
                            transition,
                            transform: `translateY(calc(var(--reel-item) * (1 - 1 * ${displayed})))`,
                          } as CSSProperties
                        }
                      >
                        <ReelStripItems
                          reelSeq={reelSeq}
                          showSounds={Boolean(showPickerSounds)}
                        />
                      </div>
                      <div aria-hidden="true" className="reel-shade" />
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          aria-label={copy.pullAria}
          className={`lever ${leverPulled ? "pulled" : ""} ${
            coach && !interacted && !disabled ? "hinting" : ""
          }`}
          disabled={disabled || spinning || allLocked}
          onClick={(event) => {
            if (event.detail === 0) pullLever();
          }}
          onPointerCancel={() => onLeverRelease(false)}
          onPointerDown={onLeverPointerDown}
          onPointerUp={() => onLeverRelease(true)}
          type="button"
        >
          <span className="lever-slot" aria-hidden="true" />
          <span className="lever-arm" aria-hidden="true">
            <span className="lever-knob" />
          </span>
          <span className="lever-label">{copy.pull}</span>
        </button>
        <span className="sr-only">{copy.pullShortcut}</span>
      </div>

      <div className="machine-lock-wrap">
        <button
          aria-label={allLocked ? copy.checking : copy.checkWord}
          aria-pressed={allLocked}
          className={`machine-lock ${readyToCheck ? "ready" : ""} ${allLocked ? "locked" : ""} ${guideStep === "check" && readyToCheck ? "coach-target" : ""}`}
          disabled={disabled || spinning || allLocked || !interacted || pickerReel !== null}
          onClick={submitAllLocks}
          type="button"
        >
          <LockIcon open={false} />
          {allLocked ? copy.checking : copy.checkWord}
        </button>
        {guideStep === "check" && readyToCheck ? <span className="coach-tip machine-lock-tip">{guideLabels.lock}</span> : null}
      </div>

      {/* Inline callout: pops down under the reels with a caret pointing
          at the targeted reel. A pick advances to the next reel; tapping a
          different reel moves the caret there directly. */}
      {pickerReel !== null ? (
        <div
        aria-label={withNumber(copy.pickerGroup, pickerReel + 1)}
          className="picker-pop"
          role="group"
        >
          <span aria-hidden="true" className="picker-caret" ref={caretRef} />
          <div className="picker-head">
            <p className="picker-title">
              {withNumber(copy.pickerTitle, pickerReel + 1)}
            </p>
            <button
              aria-label={copy.closePicker}
              className="picker-close"
              onClick={() => closePicker(true)}
              type="button"
            >
              ✕
            </button>
          </div>
          <p
            aria-label={copy.pickerShortcutsAria}
            className="picker-shortcuts"
          >
            1–5 · ← → · ↑ ↓ · Enter · Esc
          </p>
          <div className="picker-grid">
            {pickerKeys.map((key) => {
              const status =
                positionKeyboardStates[pickerReel]?.get(key.ml) ?? "empty";
              const active = letterAt(positions[pickerReel]).ml === key.ml;
              return (
                <button
                  aria-label={`${key.ml}, ${key.sound}`}
                  className={`picker-key status-${status} ${
                    active ? "active" : ""
                  }`}
                  key={key.ml}
                  onClick={() => pickLetter(key.ml)}
                  type="button"
                >
                  <span className="picker-symbol">{key.ml}</span>
                  {showPickerSounds ? (
                    <span className="picker-sound">{key.sound}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
