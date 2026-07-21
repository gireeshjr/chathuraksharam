import { readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not configured");
}

const input = await readFile("submission/video/source/narration.txt", "utf8");
const response = await fetch("https://api.openai.com/v1/audio/speech", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    input,
    instructions: [
      "Use a natural adult male voice for a polished product demo.",
      "Sound warm, confident, conversational, and genuinely enthusiastic—not like an announcer or a synthetic assistant.",
      "Speak at about 155 words per minute with varied cadence and short, natural pauses between paragraphs.",
      "Clearly pronounce Chathuraksharam as chuh-THOO-ruh-kshuh-rum, Malayalam as MAL-uh-YAH-lum, and mural as MYUR-uhl.",
      "Give subtle emphasis to Codex and GPT-5.6 without overselling them.",
    ].join(" "),
    response_format: "mp3",
  }),
});

if (!response.ok) {
  throw new Error(`OpenAI speech request failed (${response.status}): ${await response.text()}`);
}

await writeFile(
  "submission/video/openai-male-narration.mp3",
  Buffer.from(await response.arrayBuffer()),
);
