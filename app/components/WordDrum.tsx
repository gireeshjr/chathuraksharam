"use client";

import {
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type TileState = "correct" | "present" | "absent" | "empty";
export type TilePhase = "idle" | "reveal" | "settled";
export type DrumRow = {
  tiles: string[];
  result: TileState[];
  phase: TilePhase;
};

const FACE_ANGLE = 72; // 360 / 5 faces
const RETURN_TO_CURRENT_MS = 3000;

// Compound aksharams like സ്സു render wider than a square tile. Measure the
// glyph and scale it down to fit, re-measuring when the display font loads
// and when the tile resizes.
function FitSymbol({ tile }: { tile: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    // Measure against the tile face itself — intermediate wrappers (like the
    // pop-animation span) are content-sized and would always "fit".
    const face = el?.closest<HTMLElement>(".tile-face");
    if (!el || !face) return;

    const fit = () => {
      const available = face.clientWidth * 0.92;
      const width = el.offsetWidth; // layout width, unaffected by transform
      const scale =
        width > available && width > 0
          ? Math.max(0.4, available / width)
          : 1;
      el.style.transform = scale < 1 ? `scale(${scale})` : "none";
    };

    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    const observer = new ResizeObserver(fit);
    observer.observe(face);
    return () => observer.disconnect();
  }, [tile]);

  return (
    <span className="tile-symbol" ref={ref}>
      {tile}
    </span>
  );
}

function TileFace({
  tile,
  className,
}: {
  tile: string;
  className: string;
}) {
  return (
    <div className={`tile-face ${className}`}>
      {tile ? (
        <span className="tile-pop" key={tile}>
          <FitSymbol tile={tile} />
        </span>
      ) : null}
    </div>
  );
}

function Tile({
  tile,
  status,
  phase,
  index,
  soundFor,
}: {
  tile: string;
  status: TileState;
  phase: TilePhase;
  index: number;
  soundFor: (tile: string) => string;
}) {
  const revealed = phase === "settled";
  return (
    <div
      aria-label={
        tile
          ? `${tile}, ${soundFor(tile)}, ${revealed ? status : "pending"}`
          : "empty tile"
      }
      className={`tile3d ${phase} ${tile ? "has-tile" : ""}`}
      style={{ "--i": index } as CSSProperties}
    >
      <div className="tile3d-inner">
        <TileFace className="tile-front" tile={tile} />
        <div className={`tile-face tile-back ${status}`}>
          {tile ? <FitSymbol tile={tile} /> : null}
        </div>
      </div>
    </div>
  );
}

// A pentagonal drum: one guess per face. The active face points at the
// player; after a reveal the drum rolls to the next blank face. Only played
// guesses and the current attempt are navigable; future faces are inert.
export default function WordDrum({
  rows,
  activeRow,
  currentAttempt,
  attemptLabel,
  winWaveRow,
  shakeRow,
  soundFor,
  hint,
  hintLabel = "Today's hint",
}: {
  rows: DrumRow[];
  activeRow: number;
  currentAttempt: number;
  attemptLabel: string;
  winWaveRow: number | null;
  shakeRow: boolean;
  soundFor: (tile: string) => string;
  /** Meaning clue shown as a tag hanging under the drum. */
  hint?: string;
  hintLabel?: string;
}) {
  const [viewIndex, setViewIndex] = useState(activeRow);
  const [hintOpen, setHintOpen] = useState(true);
  const hintTimer = useRef<number | null>(null);
  const returnTimer = useRef<number | null>(null);

  const revealHint = () => {
    setHintOpen(true);
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintOpen(false), 5200);
  };

  useEffect(() => {
    hintTimer.current = window.setTimeout(() => setHintOpen(false), 2200);
    return () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (returnTimer.current !== null) {
        window.clearTimeout(returnTimer.current);
        returnTimer.current = null;
      }
    };
  }, [activeRow]);

  // Whenever the game advances (typing resumes, reveal starts, or the round
  // rolls forward) snap the drum back to the live face. Adjusting state
  // during render is React's recommended reset-on-prop-change pattern.
  const [prevActiveRow, setPrevActiveRow] = useState(activeRow);
  if (prevActiveRow !== activeRow) {
    setPrevActiveRow(activeRow);
    setViewIndex(activeRow);
  }

  const viewGuess = (index: number) => {
    if (returnTimer.current !== null) {
      window.clearTimeout(returnTimer.current);
      returnTimer.current = null;
    }

    setViewIndex(index);
    if (index !== activeRow) {
      returnTimer.current = window.setTimeout(() => {
        returnTimer.current = null;
        setViewIndex(activeRow);
      }, RETURN_TO_CURRENT_MS);
    }
  };

  return (
    <div className="drum-zone">
      <div aria-live="polite" className="drum-viewport">
        <div
          className="drum-inner"
          style={{ transform: `rotateX(${viewIndex * FACE_ANGLE}deg)` }}
        >
          {rows.map((row, rowIndex) => {
            const faceClass = [
              "drum-face",
              winWaveRow === rowIndex ? "win-wave" : "",
              rowIndex === activeRow && shakeRow ? "shake" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                className={faceClass}
                key={rowIndex}
                style={{ "--fi": rowIndex } as CSSProperties}
              >
                {row.tiles.map((tile, tileIndex) => (
                  <Tile
                    index={tileIndex}
                    key={`${rowIndex}-${tileIndex}`}
                    phase={row.phase}
                    soundFor={soundFor}
                    status={row.result[tileIndex]}
                    tile={tile}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div aria-label="View a guess" className="drum-dots" role="group">
        {rows.map((row, index) => {
          const played = row.phase === "settled";
          return (
            <button
              aria-label={`View guess ${index + 1}`}
              aria-pressed={viewIndex === index}
              className={`drum-dot ${played ? "played" : ""} ${
                index === currentAttempt ? "current" : ""
              } ${viewIndex === index ? "viewing" : ""}`}
              disabled={index > activeRow}
              key={index}
              onClick={() => viewGuess(index)}
              type="button"
            />
          );
        })}
      </div>
      <p aria-live="polite" className="attempt-status">
        {attemptLabel} {currentAttempt + 1} / {rows.length}
      </p>
      {hint ? (
        <div className={`drum-hint ${hintOpen ? "open" : ""}`}>
          <button
            aria-expanded={hintOpen}
            className="drum-hint-trigger"
            onClick={() => hintOpen ? setHintOpen(false) : revealHint()}
            type="button"
          >
            <strong>{hintLabel}</strong>
            <span aria-hidden="true">{hintOpen ? "⌃" : "⌄"}</span>
          </button>
          <div className="drum-hint-reveal">
            <p>{hint}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
