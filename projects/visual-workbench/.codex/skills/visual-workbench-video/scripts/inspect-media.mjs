#!/usr/bin/env node
import {execFile} from "node:child_process";
import {mkdir, readdir, writeFile} from "node:fs/promises";
import {extname, resolve} from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
const inputDir = resolve(root, process.argv[2] ?? "input/videos");
const output = resolve(root, "workbench-output/inventory.json");
const supported = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const entries = (await readdir(inputDir, {withFileTypes: true}))
  .filter((entry) => entry.isFile() && supported.has(extname(entry.name).toLowerCase()))
  .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
if (!entries.length) throw new Error(`没有在 ${inputDir} 找到视频`);

const files = [];
for (const entry of entries) {
  const absolutePath = resolve(inputDir, entry.name);
  const {stdout} = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels:format=duration,size",
    "-of", "json", absolutePath,
  ], {maxBuffer: 2 * 1024 * 1024});
  files.push({fileName: entry.name, absolutePath, ...JSON.parse(stdout)});
}
await mkdir(resolve(output, ".."), {recursive: true});
await writeFile(output, `${JSON.stringify({schemaVersion: "visual-workbench-media-inventory/1", createdAt: new Date().toISOString(), files}, null, 2)}\n`);
console.log(output);
