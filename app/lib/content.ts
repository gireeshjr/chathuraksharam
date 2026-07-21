import englishJson from "../../content/en.json";
import malayalamJson from "../../content/ml.json";
import spanishJson from "../../content/es.json";

export type KeyDefinition = { text: string; sound: string };
export type Puzzle = {
  word: string;
  pronunciation: string;
  meaning: string;
  clue: string;
};
export type Category = {
  id: string;
  label: string;
  icon: string;
  puzzles: Puzzle[];
  provenance?: { model: string; generatedAt: string };
};
export type LanguagePack = {
  id: string;
  name: string;
  nativeName: string;
  title: string;
  locale: string;
  direction: "ltr" | "rtl";
  wordSize: number;
  hintLabel: string;
  guide: {
    lock: string;
    pick: string;
  };
  keys: KeyDefinition[];
  categories: Category[];
  dictionary: string[];
};

type RawPack = Omit<LanguagePack, "keys"> & {
  keys: string | KeyDefinition[];
};

function segment(locale: string, word: string) {
  const cleaned = word.trim().replace(/\s+/g, "");
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    return Array.from(segmenter.segment(cleaned), (part) => part.segment);
  }
  return Array.from(cleaned);
}

function normalizePack(raw: RawPack): LanguagePack {
  const keys =
    typeof raw.keys === "string"
      ? Array.from(raw.keys, (text) => ({ text, sound: text }))
      : raw.keys;
  const pack: LanguagePack = { ...raw, keys };
  const keySet = new Set(keys.map((key) => key.text));
  const puzzleWords = pack.categories.flatMap((category) =>
    category.puzzles.map((puzzle) => puzzle.word),
  );
  const dictionary = [...new Set([...pack.dictionary, ...puzzleWords])];

  for (const word of dictionary) {
    const tiles = segment(pack.locale, word);
    if (tiles.length !== pack.wordSize) {
      throw new Error(
        `${pack.id} entry ${word} has ${tiles.length} tiles; expected ${pack.wordSize}.`,
      );
    }
    const missing = [...new Set(tiles.filter((tile) => !keySet.has(tile)))];
    if (missing.length > 0) {
      throw new Error(`${pack.id} entry ${word} needs key(s): ${missing.join(", ")}.`);
    }
  }

  return { ...pack, dictionary };
}

export const LANGUAGE_PACKS = [
  normalizePack(malayalamJson as RawPack),
  normalizePack(englishJson as RawPack),
  normalizePack(spanishJson as RawPack),
];

export function splitWord(pack: LanguagePack, word: string) {
  return segment(pack.locale, word);
}

export function getPack(id: string) {
  return LANGUAGE_PACKS.find((pack) => pack.id === id) ?? LANGUAGE_PACKS[0];
}
