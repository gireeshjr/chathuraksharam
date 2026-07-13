"use client";

import {
  CSSProperties,
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
// Enough runway for the farthest-travelling reel: the last reel spins
// (1 + 4) full loops plus almost a full alphabet of approach, so the strip
// must hold at least 9 alphabet copies or it scrolls into blank space.
const STRIP_COPIES = 9;
// Deterministic pseudo-shuffle (stride coprime with 35) so the server and
// client render identical reels; randomness only enters via lever pulls.
const STRIDE = 11;
const INITIAL_OFFSETS = [0, 7, 14, 21, 28];
const TAP_SLOP_PX = 7;

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
): { targets: number[]; freespin: boolean } {
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
      targets: word.map((tile, i) =>
        lockedPattern[i] ? -1 : seqIndex.get(tile)!,
      ),
    };
  }

  return {
    freespin: true,
    targets: lockedPattern.map((lockedTile) =>
      lockedTile ? -1 : pickTargetIndex(reelSeq, keyboardState),
    ),
  };
}

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

  const initialPositions = () =>
    INITIAL_OFFSETS.map((offset, i) =>
      i === 0 && presetIndex >= 0
        ? seqLength * 2 + presetIndex
        : seqLength * 2 + offset,
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
  const lastDragMoved = useRef(0);
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
        next[0] = seqLength * 2 + presetIndex;
        return next;
      });
    }
  }

  const normalize = (p: number) =>
    seqLength * 2 + ((Math.round(p) % seqLength) + seqLength) % seqLength;

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
    const { targets, freespin } = pickSpinTargets(
      reelSeq,
      keyboardState,
      dictionary,
      lockedPattern,
      new Set(usedWords),
    );

    const nextPositions = [...positions];
    setMotion(positions.map((_, i) => (locked[i] ? "idle" : "spin")));

    let lastLand = 0;
    positions.forEach((position, i) => {
      if (locked[i]) return;
      const target = targets[i];
      const base = ((Math.round(position) % seqLength) + seqLength) % seqLength;
      const forward = (target - base + seqLength) % seqLength;
      const loops = reducedMotion ? 0 : 1 + i;
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
  // Combination-lock dialing: nudge buttons and direct vertical drags.
  // ------------------------------------------------------------------

  function nudge(index: number, step: number) {
    if (disabled || spinning || locked[index] || dragReel !== null) return;
    setInteracted(true);
    sfx.tick();
    buzz(6);
    setReelMotion(index, "snap");
    const next = [...positions];
    next[index] = positions[index] + step;
    setPositions(next);
    later(() => {
      setReelMotion(index, "idle");
      setPositions((current) => {
        const settled = [...current];
        settled[index] = normalize(settled[index]);
        return settled;
      });
      onChange(next.map((p) => letterAt(p).ml), locked, "dial");
    }, 170);
  }

  const onDialPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    lastDragMoved.current = 0;
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
        (STRIP_COPIES - 1) * 35 - 2,
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
      lastDragMoved.current = drag.moved;
      const index = drag.reel;
      setDragReel(null);

      if (drag.moved > TAP_SLOP_PX) {
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

  function toggleLock(index: number) {
    if (disabled || spinning) return;
    if (lastDragMoved.current > TAP_SLOP_PX) return; // drag, not a tap

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
    onChange(currentLetters, next, next[index] ? "lock" : "unlock");
  }

  const allLocked = locked.every(Boolean);

  return (
    <div aria-label="Malayalam letter reels" className="machine" role="group">
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
              <div
                className={`reel ${locked[i] ? "locked" : ""} ${
                  reelMotion === "spin" ? "spinning" : ""
                } status-${status}`}
                key={i}
              >
                <button
                  aria-label={`Reel ${i + 1} previous letter`}
                  className="reel-nudge up"
                  disabled={disabled || spinning || locked[i]}
                  onClick={() => nudge(i, -1)}
                  type="button"
                >
                  ▲
                </button>
                <button
                  aria-label={`Reel ${i + 1}: ${key.ml}, ${key.sound}. ${
                    locked[i]
                      ? "Locked — tap to unlock"
                      : "Tap to lock, drag to dial"
                  }`}
                  aria-pressed={locked[i]}
                  className="reel-dial"
                  disabled={disabled}
                  onClick={() => toggleLock(i)}
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
                    </div>
                    <div aria-hidden="true" className="reel-shade" />
                  </div>
                  <span aria-hidden="true" className="reel-lock">
                    {locked[i] ? "🔒" : ""}
                  </span>
                </button>
                <button
                  aria-label={`Reel ${i + 1} next letter`}
                  className="reel-nudge down"
                  disabled={disabled || spinning || locked[i]}
                  onClick={() => nudge(i, 1)}
                  type="button"
                >
                  ▼
                </button>
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
          onClick={pullLever}
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
          👉 Pull the lever for luck — or dial each reel like a combination
          lock
        </p>
      ) : null}
    </div>
  );
}
