#!/usr/bin/env node
import {execFile} from "node:child_process";
import {promisify} from "node:util";

const run = promisify(execFile);
const [, , renderedPath, playerPath, thresholdValue = "0.97"] = process.argv;
if (!renderedPath || !playerPath) {
  console.error("usage: compare-keyframes <rendered.png> <player.png> <minimum-ssim>");
  process.exit(2);
}
const threshold = Number.parseFloat(thresholdValue);
const probe = async (path) => {
  const {stdout} = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path]);
  return stdout.trim();
};
const [renderedSize, playerSize] = await Promise.all([probe(renderedPath), probe(playerPath)]);
if (renderedSize !== playerSize) throw new Error(`frame size mismatch: render=${renderedSize} player=${playerSize}`);

let stderr = "";
try {
  ({stderr} = await run("ffmpeg", ["-i", renderedPath, "-i", playerPath, "-lavfi", "[0:v][1:v]ssim", "-f", "null", "-"]));
} catch (error) {
  stderr = error?.stderr ?? "";
  if (!stderr.includes("SSIM")) throw error;
}
const match = stderr.match(/All:([0-9.]+)/);
if (!match) throw new Error("ffmpeg did not report SSIM");
const ssim = Number.parseFloat(match[1]);
console.log(JSON.stringify({renderedSize, playerSize, ssim, threshold, pass: ssim >= threshold}, null, 2));
if (ssim < threshold) process.exit(1);
