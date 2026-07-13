"use client";

import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type TileState = "correct" | "present" | "absent" | "empty";
export type TilePhase = "idle" | "reveal" | "settled";
export type Mode = "fluent" | "learner";

export type DrumRow = {
  tiles: string[];
  result: TileState[];
  phase: TilePhase;
};

const FACE_ANGLE = 72; // 360 / 5 faces

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
  mode,
  soundFor,
  className,
}: {
  tile: string;
  mode: Mode;
  soundFor: (tile: string) => string;
  className: string;
}) {
  return (
    <div className={`tile-face ${className} ${mode === "learner" ? "learner" : ""}`}>
      {tile ? (
        <span className="tile-pop" key={tile}>
          <FitSymbol tile={tile} />
          {mode === "learner" ? (
            <span className="tile-sound">{soundFor(tile)}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function Tile({
  tile,
  status,
  mode,
  phase,
  index,
  soundFor,
}: {
  tile: string;
  status: TileState;
  mode: Mode;
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
        <TileFace className="tile-front" mode={mode} soundFor={soundFor} tile={tile} />
        <div
          className={`tile-face tile-back ${status} ${mode === "learner" ? "learner" : ""}`}
        >
          {tile ? (
            <>
              <FitSymbol tile={tile} />
              {mode === "learner" ? (
                <span className="tile-sound">{soundFor(tile)}</span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// A pentagonal drum: one guess per face. The active face points at the
// player; after a reveal the drum rolls to the next blank face. Dragging
// vertically (or tapping a dot) peeks at earlier guesses.
export default function WordDrum({
  rows,
  activeRow,
  winWaveRow,
  shakeRow,
  mode,
  soundFor,
}: {
  rows: DrumRow[];
  activeRow: number;
  winWaveRow: number | null;
  shakeRow: boolean;
  mode: Mode;
  soundFor: (tile: string) => string;
}) {
  const [viewIndex, setViewIndex] = useState(activeRow);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef(0);
  const dragStartY = useRef(0);
  const innerRef = useRef<HTMLDivElement>(null);
  const pointerActive = useRef(false);

  // Whenever the game advances (typing resumes, reveal starts, or the round
  // rolls forward) snap the drum back to the live face. Adjusting state
  // during render is React's recommended reset-on-prop-change pattern.
  const [prevActiveRow, setPrevActiveRow] = useState(activeRow);
  if (prevActiveRow !== activeRow) {
    setPrevActiveRow(activeRow);
    setViewIndex(activeRow);
  }

  const applyAngle = (angle: number, transition: boolean) => {
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = transition ? "" : "none";
    el.style.transform = `rotateX(${angle}deg)`;
  };

  useEffect(() => {
    if (!pointerActive.current) {
      applyAngle(viewIndex * FACE_ANGLE, true);
    }
  }, [viewIndex]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerActive.current = true;
    dragStartY.current = event.clientY;
    dragOffset.current = 0;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerActive.current) return;
    const dy = event.clientY - dragStartY.current;
    // Dragging down rolls the drum back toward earlier guesses.
    dragOffset.current = -dy * 0.3;
    applyAngle(viewIndex * FACE_ANGLE + dragOffset.current, false);
  };

  const endDrag = () => {
    if (!pointerActive.current) return;
    pointerActive.current = false;
    setDragging(false);
    const raw = viewIndex + dragOffset.current / FACE_ANGLE;
    const snapped = Math.max(0, Math.min(rows.length - 1, Math.round(raw)));
    dragOffset.current = 0;
    setViewIndex(snapped);
    applyAngle(snapped * FACE_ANGLE, true);
  };

  return (
    <div className="drum-zone">
      <div
        aria-live="polite"
        className={`drum-viewport ${dragging ? "dragging" : ""}`}
        onPointerCancel={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
      >
        <div
          className="drum-inner"
          ref={innerRef}
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
                    mode={mode}
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
                index === activeRow ? "active" : ""
              } ${viewIndex === index ? "viewing" : ""}`}
              key={index}
              onClick={() => setViewIndex(index)}
              type="button"
            />
          );
        })}
      </div>
    </div>
  );
}
