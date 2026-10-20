#!/usr/bin/env node
import {access, mkdir, readFile, writeFile} from "node:fs/promises";
import {constants} from "node:fs";
import path from "node:path";
import {adaptDirectorPlanToProjectDocument} from "../dist/index.js";

const args = process.argv.slice(2);
const overwrite = args.includes("--overwrite");
const timestampArg = args.find((value) => value.startsWith("--timestamp="));
const positional = args.filter((value) => !value.startsWith("--"));

if (positional.length !== 2) {
  console.error("Usage: adapt.mjs <director-plan.json> <project-document.json> [--timestamp=ISO] [--overwrite]");
  process.exit(2);
}

const [inputPath, outputPath] = positional.map((value) => path.resolve(value));

if (!overwrite) {
  try {
    await access(outputPath, constants.F_OK);
    console.error(`Refusing to overwrite existing output: ${outputPath}`);
    process.exit(3);
  } catch {
    // Expected when the output does not exist.
  }
}

const plan = JSON.parse(await readFile(inputPath, "utf8"));
const project = adaptDirectorPlanToProjectDocument(plan, {
  directorPlanPath: inputPath,
  ...(timestampArg ? {timestamp: timestampArg.slice("--timestamp=".length)} : {}),
});

await mkdir(path.dirname(outputPath), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(outputPath);
