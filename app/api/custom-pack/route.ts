import { Category, getPack, isCategoryAvailable, splitWord } from "../../lib/content";

export const dynamic = "force-dynamic";

function parseCustomCategory(): Category | null {
  const raw = process.env.CUSTOM_PACK_JSON;
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<Category>;
    if (
      value.id !== "custom" ||
      value.label !== "Custom" ||
      !value.hidden ||
      !value.deriveKeysFromPuzzles ||
      !Array.isArray(value.puzzles) ||
      value.puzzles.length === 0 ||
      !Array.isArray(value.dictionary) ||
      !value.expiresAt ||
      !isCategoryAvailable(value as Category)
    ) {
      return null;
    }

    const pack = getPack("ml");
    const words = [
      ...value.puzzles.map((puzzle) => puzzle?.word),
      ...value.dictionary,
    ];
    if (
      words.some(
        (word) =>
          typeof word !== "string" ||
          splitWord(pack, word).length !== pack.wordSize,
      ) ||
      value.puzzles.some(
        (puzzle) =>
          !puzzle ||
          [puzzle.word, puzzle.pronunciation, puzzle.meaning, puzzle.clue].some(
            (field) => typeof field !== "string" || !field.trim(),
          ),
      )
    ) {
      return null;
    }

    return value as Category;
  } catch {
    return null;
  }
}

export async function GET() {
  const category = parseCustomCategory();
  if (!category) {
    return Response.json(
      { error: "Custom pack unavailable." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return Response.json(category, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
