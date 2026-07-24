import fs from "node:fs";
import path from "node:path";

export function readPack(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function keyTexts(pack) {
  return typeof pack.keys === "string"
    ? Array.from(pack.keys)
    : pack.keys.map((key) => key.text);
}

export function splitWord(pack, word) {
  const segmenter = new Intl.Segmenter(pack.locale, { granularity: "grapheme" });
  return Array.from(segmenter.segment(word.trim().replace(/\s+/g, "")), (part) => part.segment);
}

export function validateWords(pack, words) {
  const keys = new Set(keyTexts(pack));
  const errors = [];
  for (const word of words) {
    const tiles = splitWord(pack, word);
    if (tiles.length !== pack.wordSize) {
      errors.push(`${word}: ${tiles.length} tiles, expected ${pack.wordSize}`);
      continue;
    }
    const missing = [...new Set(tiles.filter((tile) => !keys.has(tile)))];
    if (missing.length) errors.push(`${word}: missing keys ${missing.join(", ")}`);
  }
  return errors;
}

export function validatePack(pack) {
  const errors = validateWords(pack, pack.dictionary);
  if (!pack.title?.trim()) errors.push("pack missing title");
  for (const field of ["lock", "pick"]) {
    if (!pack.guide?.[field]?.trim()) errors.push(`guide missing ${field}`);
  }
  for (const category of pack.categories) {
    const categoryWords = [
      ...category.puzzles.map((puzzle) => puzzle.word),
      ...(category.dictionary ?? []),
    ];
    if (category.deriveKeysFromPuzzles) {
      for (const word of categoryWords) {
        const tiles = splitWord(pack, word);
        if (tiles.length !== pack.wordSize) {
          errors.push(`${category.id}/${word}: ${tiles.length} tiles, expected ${pack.wordSize}`);
        }
      }
    } else {
      errors.push(...validateWords(pack, categoryWords));
    }
    for (const puzzle of category.puzzles) {
      for (const field of ["word", "pronunciation", "meaning", "clue"]) {
        if (!puzzle[field]?.trim()) errors.push(`${category.id}: puzzle missing ${field}`);
      }
    }
  }
  return errors;
}

export function projectPath(...parts) {
  return path.join(process.cwd(), ...parts);
}
