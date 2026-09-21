#!/usr/bin/env node
import {access, copyFile, link, lstat, mkdir, readFile, readdir, realpath} from "node:fs/promises";
import {basename, dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";

const [, , inputPath, outputPath, startFrameArg, endFrameArg] = process.argv;
if (!inputPath || !outputPath) {
  console.error("usage: render-project-job <approved-input-props.json> <output.mp4> [start-frame end-frame]");
  process.exit(2);
}
const hasFrameRange = typeof startFrameArg !== "undefined" || typeof endFrameArg !== "undefined";
const startFrame = Number.parseInt(startFrameArg ?? "", 10);
const endFrame = Number.parseInt(endFrameArg ?? "", 10);
if (hasFrameRange && (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame < startFrame)) {
  throw new Error("frame range must contain non-negative integer start/end frames");
}

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const workspacePublic = resolve(workspaceRoot, "public");
const inputProps = JSON.parse(await readFile(resolve(inputPath), "utf8"));
if (!inputProps.project?.projectId || !inputProps.project?.settings || !Array.isArray(inputProps.project?.clips)) {
  throw new Error("renderer requires a valid ProjectDocument");
}
const output = resolve(outputPath);
await mkdir(dirname(output), {recursive: true});
const runtimeRoot = resolve(workspaceRoot, ".render-runtime", basename(dirname(output)));
const runtimePublic = resolve(runtimeRoot, "public");
const bundleDir = resolve(runtimeRoot, "bundle");

const assertPublicPath = (path) => {
  const relativePath = relative(workspacePublic, path);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error(`render asset must be inside the workspace public directory: ${path}`);
  }
};

const materializeFile = async (source, destination) => {
  assertPublicPath(source);
  await mkdir(dirname(destination), {recursive: true});
  const resolvedSource = await realpath(source);
  try {
    await link(resolvedSource, destination);
  } catch (error) {
    if (error?.code === "EEXIST") return;
    if (error?.code !== "EXDEV") throw error;
    await copyFile(resolvedSource, destination);
  }
};

const materializeDirectory = async (source, destination) => {
  assertPublicPath(source);
  await mkdir(destination, {recursive: true});
  for (const entry of await readdir(source, {withFileTypes: true})) {
    const sourceEntry = resolve(source, entry.name);
    const destinationEntry = resolve(destination, entry.name);
    if (entry.isDirectory()) {
      await materializeDirectory(sourceEntry, destinationEntry);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      const metadata = await lstat(sourceEntry);
      if (metadata.isSymbolicLink()) {
        const targetMetadata = await lstat(await realpath(sourceEntry));
        if (targetMetadata.isDirectory()) continue;
      }
      await materializeFile(sourceEntry, destinationEntry);
    }
  }
};

const assetPaths = [...new Set(Object.values(inputProps.assetMap ?? {}).filter((path) => typeof path === "string"))];
for (const assetPath of assetPaths) {
  await materializeFile(resolve(workspacePublic, assetPath), resolve(runtimePublic, assetPath));
}
for (const sharedDirectory of [".media/audio/sfx", "assets/ai-logo-sphere"]) {
  const source = resolve(workspacePublic, sharedDirectory);
  try {
    await access(source);
    await materializeDirectory(source, resolve(runtimePublic, sharedDirectory));
  } catch {
    // Optional shared libraries are intentionally absent from a clean clone.
  }
}

const serveUrl = await bundle({
  entryPoint: resolve(packageRoot, "dist/remotion-root.js"),
  outDir: bundleDir,
  publicDir: runtimePublic,
  symlinkPublicDir: true,
  webpackOverride: (config) => config
});
const composition = await selectComposition({serveUrl, id: "EditorComposition", inputProps});
if (hasFrameRange && endFrame >= composition.durationInFrames) {
  throw new Error(`frame range ${startFrame}-${endFrame} exceeds composition duration ${composition.durationInFrames}`);
}
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: output,
  inputProps,
  concurrency: 4,
  crf: 16,
  pixelFormat: "yuv420p",
  audioBitrate: "320k",
  ...(hasFrameRange ? {frameRange: [startFrame, endFrame]} : {}),
});
console.log(output);
