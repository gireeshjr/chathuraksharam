"use client";

import {
  CSSProperties,
  memo,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buzz, sfx } from "../lib/sfx";

type KeyDef = { ml: string; sound: string };
type TileState = "correct" | "present" | "absent" | "empty";
type ReelMotion = "idle" | "spin" | "snap";

export type MachineEvent = "land" | "freespin" | "lock" | "unlock" | "dial";

const REEL_COUNT = 5;
// Enough runway for the farthest-travelling reel: a spin adds one full loop
// plus almost a full alphabet of approach from the resting copy, so the
// strip must hold at least 4 alphabet copies or it scrolls into blank
// space. Keeping the strip short matters: each reel is one big composited
// layer, and tall strips pushed mobile Safari into memory-pressure page
// reloads mid-game.
const STRIP_COPIES = 4;
// Deterministic pseudo-shuffle (stride coprime with 35) so the server and
// client render identical reels; randomness only enters via lever pulls.
const STRIDE = 11;
const INITIAL_OFFSETS = [0, 7, 14, 21, 28];

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

// The lever prefers real words: pick a dictionary word that agrees with
// every locked reel and spin the free reels to spell it. Only when no word
// fits the locks does the pull fall back to weighted-random letters.
function pickSpinTargets(
  reelSeq: KeyDef[],
  keyboardState: Map<string, TileState>,
  dictionary: ReadonlyArray<ReadonlyArray<string>>,
  lockedPattern: (string | null)[],
  usedWords: ReadonlySet<string>,
): { targets: number[]; freespin: boolean; word: string | null } {
  const seqIndex = new Map(reelSeq.map((key, index) => [key.ml, index]));
  const candidates = dictionary.filter(
    (tiles) =>
      !usedWords.has(tiles.join("")) &&
      tiles.every(
        (tile, i) =>
          seqIndex.has(tile) && (!lockedPattern[i] || lockedPattern[i] === tile),
      ),
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
  learner,
}: {
  reelSeq: KeyDef[];
  learner: boolean;
}) {
  return (
    <>
      {Array.from({ length: STRIP_COPIES }, (_, copy) =>
        reelSeq.map((item, idx) => (
          <span
            aria-hidden={copy > 0}
            className={`reel-item ${learner ? "learner" : ""}`}
            key={`${copy}-${idx}`}
          >
            <span className="reel-symbol">{item.ml}</span>
            {learner ? (
              <span className="reel-sound">{item.sound}</span>
            ) : null}
          </span>
        )),
      )}
    </>
  );
});

export default function SlotMachine({
  keys,
  keyboardState,
  learner,
  disabled,
  roundKey,
  presetLetter,
  dictionary,
  usedWords,
  onChange,
}: {
  keys: ReadonlyArray<KeyDef>;
  keyboardState: Map<string, TileState>;
  learner: boolean;
  disabled: boolean;
  roundKey: number;
  /** The hinted first aksharam: reel 1 starts on it, pre-locked. */
  presetLetter?: string;
  /** Guess dictionary as pre-split aksharam arrays; pulls land on these. */
  dictionary: ReadonlyArray<ReadonlyArray<string>>;
  /** Words already guessed this round — pulls avoid repeating them. */
  usedWords: ReadonlyArray<string>;
  onChange: (letters: string[], locked: boolean[], event: MachineEvent) => void;
}) {
  const reelSeq = useMemo(() => {
    const seq: KeyDef[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      seq.push(keys[(i * STRIDE) % keys.length]);
    }
    return seq;
  }, [keys]);
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
  const initialPositions = () =>
    INITIAL_OFFSETS.map((offset, i) =>
      i === 0 && presetIndex >= 0
        ? seqLength + presetIndex
        : seqLength + offset,
    );
  const initialLocked = () => {
    const flags = Array(REEL_COUNT).fill(false);
    if (presetIndex >= 0) flags[0] = true;
    return flags;
  };

  // positions[i] is an index into the repeated strip; the visible letter is
  // reelSeq[position mod seqLength]. Kept within the middle copies.
  const [positions, setPositions] = useState<number[]>(initialPositions);
  const [locked, setLocked] = useState<boolean[]>(initialLocked);
  const [motion, setMotion] = useState<ReelMotion[]>(() =>
    Array(REEL_COUNT).fill("idle"),
  );
  const [dragReel, setDragReel] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState(0);
  const [pickerReel, setPickerReel] = useState<number | null>(null);
  const [leverPulled, setLeverPulled] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const timeouts = useRef<number[]>([]);
  const dragRef = useRef<{
    reel: number;
    startY: number;
    startPos: number;
    itemHeight: number;
    moved: number;
    live: number;
  } | null>(null);
  const lastPointerWasDrag = useRef(false);
  // Dictionary words the lever has landed on since page load; cleared only
  // when every word fitting the locks has been shown.
  const landedWords = useRef<Set<string>>(new Set());
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

  // New round: everything resets — the hinted first reel snaps back to the
  // given letter and re-locks (reset-on-prop-change pattern).
  const [prevRound, setPrevRound] = useState(roundKey);
  if (prevRound !== roundKey) {
    setPrevRound(roundKey);
    setLocked(initialLocked());
    if (presetIndex >= 0) {
      setPositions((current) => {
        const next = [...current];
        next[0] = seqLength + presetIndex;
        return next;
      });
    }
  }

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
    setInteracted(true); // stop the hint animation fighting the pull
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
    later(() => setLeverPulled(false), 620);
    setInteracted(true);
    sfx.crank();
    buzz([14, 30, 14]);

    const lockedPattern = positions.map((position, i) =>
      locked[i] ? letterAt(position).ml : null,
    );
    // Pulls avoid words this session's lever already landed on; a word only
    // repeats once every other fitting word has been shown.
    const guessed = new Set(usedWords);
    let pick = pickSpinTargets(
      reelSeq,
      keyboardState,
      dictionary,
      lockedPattern,
      new Set([...guessed, ...landedWords.current]),
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
      );
      if (!retry.freespin) {
        landedWords.current.clear();
        pick = retry;
      }
    }
    const { targets, freespin } = pick;
    if (pick.word) landedWords.current.add(pick.word);

    const nextPositions = [...positions];
    setMotion(positions.map((_, i) => (locked[i] ? "idle" : "spin")));

    let lastLand = 0;
    positions.forEach((position, i) => {
      if (locked[i]) return;
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
    }, lastLand + 120);
  }

  // ------------------------------------------------------------------
  // Direct letter picking (per-reel keyboard) and vertical drags.
  // ------------------------------------------------------------------

  function openPicker(index: number) {
    if (disabled || spinning || locked[index] || dragReel !== null) return;
    if (pickerReel === index) return; // already targeted — stays open
    sfx.key();
    setPickerReel(index);
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
    return () => window.removeEventListener("resize", position);
  }, [pickerReel]);

  function pickLetter(letter: string) {
    // The callout stays open and keeps pointing at the reel, so the
    // player can hop reel to reel without reopening it.
    const index = pickerReel;
    if (index === null || disabled || spinning || locked[index]) return;
    const target = reelSeq.findIndex((key) => key.ml === letter);
    if (target < 0) return;

    setInteracted(true);
    sfx.tick();
    buzz(6);

    // Snap along the shortest path so the reel visibly rolls to the pick.
    const current = Math.round(positions[index]);
    const base = ((current % seqLength) + seqLength) % seqLength;
    let delta = target - base;
    if (delta > seqLength / 2) delta -= seqLength;
    if (delta < -seqLength / 2) delta += seqLength;
    if (delta === 0) return;

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
    }, 170);
  }

  const onDialPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    lastPointerWasDrag.current = false;
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
    // No pointer capture: it would retarget click events away from the
    // lock/unlock button semantics.
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
      lastPointerWasDrag.current = !isTap;

      if (!isTap) {
        setInteracted(true);
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
    // letterAt/normalize are stable per reelSeq; locked is read fresh enough
    // for the dial event payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, seqLength]);

  function nextUnlocked(from: number, lockedFlags: boolean[]) {
    for (let step = 1; step <= REEL_COUNT; step += 1) {
      const i = (from + step) % REEL_COUNT;
      if (!lockedFlags[i]) return i;
    }
    return null;
  }

  function toggleLock(index: number) {
    if (disabled || spinning) return;

    const next = [...locked];
    next[index] = !next[index];
    setLocked(next);
    if (next[index]) {
      sfx.lock();
      buzz(12);
    } else {
      sfx.unlock();
      buzz(8);
    }
    // Locking the callout's target hops it to the next unlocked reel
    // (closing it when that was the last one — the auto-check takes over).
    if (next[index] && pickerReel === index) {
      setPickerReel(nextUnlocked(index, next));
    }
    onChange(currentLetters, next, next[index] ? "lock" : "unlock");
  }

  const allLocked = locked.every(Boolean);

  return (
    <div
      aria-label="Malayalam letter reels"
      className="machine"
      ref={machineRef}
      role="group"
    >
      <div className="machine-body">
        <div className="reel-bank">
          {positions.map((position, i) => {
            const displayed = dragReel === i ? dragPos : position;
            const key = letterAt(displayed);
            const status = keyboardState.get(key.ml) ?? "empty";
            const reelMotion = motion[i];
            const transition =
              dragReel === i || reelMotion === "idle"
                ? "none"
                : reelMotion === "spin"
                  ? `transform ${820 + i * 240}ms cubic-bezier(0.18, 0.7, 0.3, 1.08)`
                  : "transform 160ms cubic-bezier(0.3, 1.3, 0.5, 1)";
            return (
              <div className="reel-col" key={i}>
                <button
                  aria-label={
                    locked[i]
                      ? `Unlock reel ${i + 1}`
                      : `Lock reel ${i + 1} on ${key.ml}`
                  }
                  aria-pressed={locked[i]}
                  className={`reel-lock-btn ${locked[i] ? "locked" : ""}`}
                  disabled={disabled || spinning}
                  onClick={() => toggleLock(i)}
                  type="button"
                >
                  <LockIcon open={!locked[i]} />
                </button>
                <div
                  className={`reel ${locked[i] ? "locked" : ""} ${
                    pickerReel === i ? "targeted" : ""
                  } ${reelMotion === "spin" ? "spinning" : ""} status-${status}`}
                >
                <button
                  aria-label={`Reel ${i + 1}: ${key.ml}, ${key.sound}. ${
                    locked[i]
                      ? "Locked — unlock to change"
                      : "Tap to pick a letter, drag to dial"
                  }`}
                  className="reel-dial"
                  disabled={disabled}
                  onClick={(event) => {
                    // Keyboard activation (detail 0) always opens; pointer
                    // clicks only when the gesture was a tap, not a dial.
                    if (event.detail === 0 || !lastPointerWasDrag.current) {
                      openPicker(i);
                    }
                  }}
                  onPointerDown={(event) => onDialPointerDown(event, i)}
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
                      <ReelStripItems learner={learner} reelSeq={reelSeq} />
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
          aria-label="Pull the lever to spin the letters"
          className={`lever ${leverPulled ? "pulled" : ""} ${
            !interacted && !disabled ? "hinting" : ""
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
          <span className="lever-label">PULL</span>
        </button>
      </div>

      {!interacted && !disabled ? (
        <p className="machine-hint" aria-hidden="true">
          👉 Pull the lever for luck — or tap a reel to pick its letter
        </p>
      ) : null}

      {/* Inline callout: pops down under the reels with a caret pointing
          at the targeted reel, so the board stays visible while picking.
          Tapping another reel just slides the caret over. */}
      {pickerReel !== null ? (
        <div
          aria-label={`Pick a letter for reel ${pickerReel + 1}`}
          className="picker-pop"
          role="group"
        >
          <span aria-hidden="true" className="picker-caret" ref={caretRef} />
          <div className="picker-head">
            <p className="picker-title">
              Reel {pickerReel + 1} — pick a letter
            </p>
            <button
              aria-label="Close the letter picker"
              className="picker-close"
              onClick={() => setPickerReel(null)}
              type="button"
            >
              ✕
            </button>
          </div>
          <div className="picker-grid">
            {keys.map((key) => {
              const status = keyboardState.get(key.ml) ?? "empty";
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
                  {learner ? (
                    <span className="picker-sound">{key.sound}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <button
            aria-label={`Lock reel ${pickerReel + 1} on ${
              letterAt(positions[pickerReel]).ml
            }`}
            className="picker-lock"
            onClick={() => toggleLock(pickerReel)}
            type="button"
          >
            <LockIcon open={false} />
            Lock {letterAt(positions[pickerReel]).ml}
          </button>
        </div>
      ) : null}
    </div>
  );
}
