import fs from "node:fs";
import { keyTexts, projectPath, readPack, validateWords } from "./content-utils.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
const language = args.language ?? "ml";
const category = args.category ?? "everyday";
const count = Math.max(1, Math.min(12, Number(args.count ?? 6)));
const packFile = projectPath("content", `${language}.json`);

if (!fs.existsSync(packFile)) {
  throw new Error(`Unknown language pack: ${language}`);
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("Set OPENAI_API_KEY before generating puzzle candidates.");
}

const pack = readPack(packFile);
const categoryInfo = pack.categories.find((item) => item.id === category);
if (!categoryInfo) throw new Error(`Unknown category ${category} for ${language}`);

const puzzleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    puzzles: {
      type: "array",
      minItems: count,
      maxItems: count,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          word: { type: "string" },
          pronunciation: { type: "string" },
          meaning: { type: "string" },
          clue: { type: "string" }
        },
        required: ["word", "pronunciation", "meaning", "clue"]
      }
    },
    dictionary: {
      type: "array",
      minItems: 20,
      items: { type: "string" }
    }
  },
  required: ["puzzles", "dictionary"]
};

const prompt = `Create a culturally natural ${pack.nativeName} word-game pack for the category "${categoryInfo.label}".
Return ${count} kid-safe answer puzzles and at least 20 additional real dictionary words.
Every word must contain exactly ${pack.wordSize} Unicode grapheme clusters, contain no spaces or punctuation, and use only these playable tiles: ${keyTexts(pack).join(" ")}.
Write each clue in ${pack.nativeName}. Make clues specific but do not include the answer. Meanings may be concise English glosses. Avoid trademarks, politics, violence, obscure inflections, and duplicates.
Existing words to avoid: ${pack.dictionary.join(", ")}.`;

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL ?? "gpt-5.6",
    reasoning: { effort: "medium" },
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "puzzle_pack",
        strict: true,
        schema: puzzleSchema
      }
    }
  })
});

if (!response.ok) {
  throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
const outputText = payload.output
  ?.flatMap((item) => item.content ?? [])
  .find((item) => item.type === "output_text")?.text;
if (!outputText) throw new Error("The model returned no structured puzzle pack.");

const candidate = JSON.parse(outputText);
const words = [
  ...candidate.puzzles.map((puzzle) => puzzle.word),
  ...candidate.dictionary
];
const errors = validateWords(pack, words);
if (errors.length) {
  throw new Error(`Candidate rejected:\n- ${errors.join("\n- ")}`);
}

const outputDir = projectPath("content", "generated");
fs.mkdirSync(outputDir, { recursive: true });
const outputFile = projectPath(
  "content",
  "generated",
  `${language}-${category}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
fs.writeFileSync(
  outputFile,
  `${JSON.stringify({ ...candidate, generatedBy: process.env.OPENAI_MODEL ?? "gpt-5.6", generatedAt: new Date().toISOString(), language, category }, null, 2)}\n`,
);
console.log(`✓ Validated candidate written to ${outputFile}`);
