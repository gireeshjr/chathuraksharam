"use client";

// Tiny WebAudio synth: no audio assets, everything generated on the fly.
// The context is created lazily on the first user gesture so autoplay
// policies never block it.

let audio: AudioContext | null = null;
let enabled = true;

export function setSfxEnabled(on: boolean) {
  enabled = on;
}

function ctx(): AudioContext | null {
  if (typeof window === "undefined" || !enabled) return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audio) audio = new AC();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

type ToneOptions = {
  at?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
};

function tone(freq: number, options: ToneOptions = {}) {
  const ac = ctx();
  if (!ac) return;

  const duration = options.duration ?? 0.15;
  const start = ac.currentTime + (options.at ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = options.type ?? "sine";
  osc.frequency.setValueAtTime(freq, start);
  if (options.slideTo) {
    osc.frequency.exponentialRampToValueAtTime(options.slideTo, start + duration);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(options.gain ?? 0.07, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export const sfx = {
  key() {
    tone(640, { duration: 0.06, type: "triangle", gain: 0.045 });
  },
  pluck() {
    tone(520, { duration: 0.09, type: "triangle", gain: 0.05, slideTo: 780 });
  },
  crank() {
    [420, 330, 260, 210].forEach((freq, index) => {
      tone(freq, { at: index * 0.07, duration: 0.06, type: "sawtooth", gain: 0.035 });
    });
  },
  thunk(index: number) {
    tone(130 + index * 14, { duration: 0.12, type: "sine", gain: 0.075, slideTo: 90 });
    tone(700 + index * 40, { duration: 0.03, type: "square", gain: 0.02 });
  },
  tick() {
    tone(940, { duration: 0.035, type: "square", gain: 0.03 });
  },
  lock() {
    tone(880, { duration: 0.05, type: "square", gain: 0.035 });
    tone(1320, { at: 0.04, duration: 0.07, type: "square", gain: 0.03 });
  },
  unlock() {
    tone(700, { duration: 0.08, type: "square", gain: 0.03, slideTo: 480 });
  },
  roll() {
    tone(300, { duration: 0.3, type: "triangle", gain: 0.045, slideTo: 150 });
    tone(150, { at: 0.26, duration: 0.1, type: "sine", gain: 0.04 });
  },
  erase() {
    tone(320, { duration: 0.08, type: "triangle", gain: 0.045, slideTo: 210 });
  },
  invalid() {
    tone(190, { duration: 0.11, type: "sawtooth", gain: 0.05 });
    tone(150, { at: 0.1, duration: 0.14, type: "sawtooth", gain: 0.05 });
  },
  flip(index: number) {
    tone(320 + index * 64, {
      duration: 0.13,
      type: "sine",
      gain: 0.04,
      slideTo: 540 + index * 64,
    });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
      tone(freq, { at: index * 0.11, duration: 0.32, type: "triangle", gain: 0.065 });
    });
    tone(1318.5, { at: 0.44, duration: 0.5, type: "sine", gain: 0.05 });
  },
  lose() {
    [330, 262, 196].forEach((freq, index) => {
      tone(freq, { at: index * 0.16, duration: 0.24, type: "triangle", gain: 0.055 });
    });
  },
};

export function buzz(pattern: number | number[] = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
