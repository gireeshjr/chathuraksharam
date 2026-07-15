"use client";

import { useEffect, useRef } from "react";

// Malayalam aksharams drifting toward the viewer in a perspective-projected
// star field. Plain 2D canvas keeps this dependency-free and cheap on mobile.
const GLYPHS = [
  "ക", "മ", "ന", "വ", "ത", "ല", "ര", "പ", "ച", "ദ",
  "അ", "ഇ", "ഉ", "എ", "ഒ", "ങ്ങ", "ഴ", "ള", "റ", "ണ",
];

const COLORS = [
  [224, 170, 75], // brass gold
  [46, 191, 133], // emerald
  [226, 114, 91], // terracotta
  [244, 239, 227], // ivory
];

type Particle = {
  nx: number;
  ny: number;
  z: number;
  glyph: string;
  size: number;
  speed: number;
  sway: number;
  swayPhase: number;
  color: number[];
};

const FOCAL = 420;
const FAR = 1600;
const NEAR = 60;

export default function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isSmall = window.matchMedia("(max-width: 639px)").matches;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    const count = isSmall ? 26 : 52;
    // Phones: half the frame rate. A 60fps full-screen canvas is a steady
    // energy drain iOS punishes with page kills; the drift reads the same
    // at 30fps.
    const minFrameMs = isCoarse ? 1000 / 30 - 2 : 0;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;

    const spawn = (z?: number): Particle => ({
      nx: (Math.random() * 2 - 1) * 1.1,
      ny: (Math.random() * 2 - 1) * 1.1,
      z: z ?? NEAR + Math.random() * (FAR - NEAR),
      glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      size: 26 + Math.random() * 34,
      speed: 0.45 + Math.random() * 0.85,
      sway: 6 + Math.random() * 14,
      swayPhase: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });

    const particles: Particle[] = Array.from({ length: count }, () => spawn());

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let lastFrame = 0;
    const draw = (time: number) => {
      if (minFrameMs && time - lastFrame < minFrameMs) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrame = time;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        if (!reducedMotion) {
          p.z -= p.speed;
          if (p.z < NEAR) {
            Object.assign(p, spawn(FAR));
          }
        }

        const scale = FOCAL / (FOCAL + p.z);
        const swayX = Math.sin(time / 2400 + p.swayPhase) * p.sway * scale;
        const x = width / 2 + p.nx * width * 0.62 * scale + swayX;
        const y = height / 2 + p.ny * height * 0.62 * scale;
        const depth = 1 - (p.z - NEAR) / (FAR - NEAR);
        const alpha = 0.03 + depth * 0.16;
        const [r, g, b] = p.color;

        ctx.font = `600 ${Math.max(10, p.size * scale * 2.2)}px "Baloo Chettan 2", "Noto Sans Malayalam", sans-serif`;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.glyph, x, y);
      }

      if (!reducedMotion && running) {
        raf = requestAnimationFrame(draw);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reducedMotion) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas aria-hidden="true" className="backdrop-canvas" ref={canvasRef} />;
}
