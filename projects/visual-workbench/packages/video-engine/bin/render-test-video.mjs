#!/usr/bin/env node
import {readFile, mkdir} from "node:fs/promises";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("usage: render-test-video <input-props.json> <output.mp4>");
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const inputProps = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const output = resolve(outputPath);
await mkdir(dirname(output), {recursive: true});
const serveUrl = await bundle({
  entryPoint: resolve(packageRoot, "dist/remotion-root.js"),
  publicDir: resolve(workspaceRoot, "public"),
  webpackOverride: (config) => config,
});
const composition = await selectComposition({serveUrl, id: "EditorComposition", inputProps});
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: output,
  inputProps,
  concurrency: 4,
});
console.log(output);
