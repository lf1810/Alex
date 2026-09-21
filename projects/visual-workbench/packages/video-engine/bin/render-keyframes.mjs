#!/usr/bin/env node
import {readFile, mkdir} from "node:fs/promises";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {bundle} from "@remotion/bundler";
import {renderStill, selectComposition} from "@remotion/renderer";

const [, , inputPath, outputDir, frameList = "0"] = process.argv;
if (!inputPath || !outputDir) {
  console.error("usage: render-keyframes <input-props.json> <output-dir> <comma-separated-frames>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const inputProps = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const frames = frameList.split(",").map((value) => Number.parseInt(value, 10));
if (frames.some((frame) => !Number.isInteger(frame) || frame < 0)) throw new Error("frames must be non-negative integers");

const serveUrl = await bundle({
  entryPoint: resolve(packageRoot, "dist/remotion-root.js"),
  publicDir: resolve(workspaceRoot, "public"),
  webpackOverride: (config) => config,
});
const composition = await selectComposition({serveUrl, id: "EditorComposition", inputProps});
await mkdir(resolve(outputDir), {recursive: true});
for (const frame of frames) {
  if (frame >= composition.durationInFrames) throw new Error(`frame ${frame} exceeds duration ${composition.durationInFrames}`);
  const output = resolve(outputDir, `frame-${String(frame).padStart(4, "0")}.png`);
  await renderStill({composition, serveUrl, output, frame, inputProps, imageFormat: "png"});
  console.log(output);
}
