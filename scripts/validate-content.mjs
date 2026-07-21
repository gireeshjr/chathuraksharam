import fs from "node:fs";
import { projectPath, readPack, validatePack } from "./content-utils.mjs";

const contentDir = projectPath("content");
const files = fs.readdirSync(contentDir).filter((file) => file.endsWith(".json"));
let failed = false;

for (const file of files) {
  const pack = readPack(projectPath("content", file));
  const errors = validatePack(pack);
  if (errors.length) {
    failed = true;
    console.error(`${file}:\n- ${errors.join("\n- ")}`);
  } else {
    console.log(`✓ ${file}: ${pack.categories.length} categories, ${pack.dictionary.length} dictionary words`);
  }
}

if (failed) process.exit(1);
