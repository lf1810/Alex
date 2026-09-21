#!/usr/bin/env node
import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {AJIUNOTES_TECH_CONSOLE_V1} from "@ajiunotes/style-library";
import {templateRegistry} from "@ajiunotes/template-registry";

const [, , projectPath, outputPath] = process.argv;
if (!projectPath || !outputPath) {
  console.error("usage: build-fixture-props <project.json> <input-props.json>");
  process.exit(2);
}
const project = JSON.parse(await readFile(resolve(projectPath), "utf8"));
const inputProps = {
  project,
  styleProfile: AJIUNOTES_TECH_CONSOLE_V1,
  templateRegistry,
  assetMap: Object.fromEntries(project.assets.map((asset) => [asset.id, asset.sourcePath])),
};
await writeFile(resolve(outputPath), `${JSON.stringify(inputProps, null, 2)}\n`);
console.log(resolve(outputPath));
