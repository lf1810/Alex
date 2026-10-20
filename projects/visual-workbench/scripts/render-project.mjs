#!/usr/bin/env node
import {execFile} from "node:child_process";
import {mkdir, readFile, readdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {promisify} from "node:util";
import {AJIUNOTES_TECH_CONSOLE_V1} from "../packages/style-library/dist/index.js";
import {templateRegistry} from "../packages/template-registry/dist/index.js";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const [requested] = process.argv.slice(2).filter((argument) => argument !== "--");
if (!requested) throw new Error("用法：pnpm render:project -- <项目名称或项目ID>");
const projectsRoot = resolve(root, "public/projects");
const resolveProjectId = async (query) => {
  const entries = await readdir(projectsRoot, {withFileTypes: true});
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const candidate = JSON.parse(await readFile(resolve(projectsRoot, entry.name, "project.json"), "utf8"));
      if (entry.name === query || candidate.projectId === query || candidate.name === query) {
        matches.push(candidate.projectId);
      }
    } catch {
      // Ignore incomplete directories.
    }
  }
  if (!matches.length) throw new Error(`没有找到项目：${query}`);
  if (matches.length > 1) throw new Error(`项目名称不唯一，请改用项目 ID：${matches.join("、")}`);
  return matches[0];
};
const projectId = await resolveProjectId(requested);
const projectPath = resolve(projectsRoot, projectId, "project.json");
const project = JSON.parse(await readFile(projectPath, "utf8"));
const assetMap = Object.fromEntries(project.assets.map((asset) => [asset.id, asset.sourcePath]));
const inputProps = {project, styleProfile: AJIUNOTES_TECH_CONSOLE_V1, templateRegistry, assetMap};
const runtimeDir = resolve(root, ".render-runtime", `community-${projectId}`);
await mkdir(runtimeDir, {recursive: true});
const inputPath = resolve(runtimeDir, "input-props.json");
await writeFile(inputPath, `${JSON.stringify(inputProps, null, 2)}\n`);
const outputDir = resolve(root, "exports");
await mkdir(outputDir, {recursive: true});
const output = resolve(outputDir, `${projectId}-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`);
await execFileAsync("node", [resolve(root, "packages/video-engine/bin/render-project-job.mjs"), inputPath, output], {
  cwd: root,
  maxBuffer: 64 * 1024 * 1024
});
const {stdout} = await execFileAsync("ffprobe", [
  "-v", "error",
  "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration,size",
  "-of", "json", output
]);
console.log(JSON.stringify({output, probe: JSON.parse(stdout)}, null, 2));
