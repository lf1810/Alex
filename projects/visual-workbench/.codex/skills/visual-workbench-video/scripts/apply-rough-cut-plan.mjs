#!/usr/bin/env node
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {access, copyFile, mkdir, readFile, writeFile} from "node:fs/promises";
import {basename, extname, relative, resolve} from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
const [planArgument] = process.argv.slice(2).filter((argument) => argument !== "--");
const planPath = resolve(planArgument ?? "");
if (!planArgument) throw new Error("用法：apply-rough-cut-plan.mjs <rough-cut-plan.json>");
const plan = JSON.parse(await readFile(planPath, "utf8"));
if (plan.schemaVersion !== "visual-workbench-rough-cut/1") throw new Error("初剪方案版本不受支持");
if (plan.status !== "confirmed") throw new Error("初剪方案尚未由用户确认，拒绝写入编导台");
if (!Array.isArray(plan.segments) || !plan.segments.length) throw new Error("初剪方案没有片段");

const safeId = (value) => {
  const clean = String(value ?? "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56);
  return clean.length >= 2 ? clean : `video-project-${Date.now().toString(36)}`;
};
const parseRate = (value) => {
  const [a, b] = String(value ?? "30/1").split("/").map(Number);
  return b ? a / b : a;
};
const sourcePath = (value) => value.startsWith("/") ? resolve(value) : resolve(root, "input/videos", value);
const sources = new Map();
for (const segment of plan.segments) {
  const absolute = sourcePath(segment.sourceFile);
  if (!sources.has(absolute)) {
    await access(absolute);
    const {stdout} = await execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
      "-of", "json", absolute,
    ]);
    const probe = JSON.parse(stdout);
    const stream = probe.streams?.[0];
    const duration = Number(probe.format?.duration ?? 0);
    if (!stream?.width || !stream?.height || !(duration > 0)) throw new Error(`无法读取视频：${absolute}`);
    sources.set(absolute, {absolute, width: stream.width, height: stream.height, fps: parseRate(stream.avg_frame_rate), duration});
  }
  const source = sources.get(absolute);
  if (!(segment.sourceEndSeconds > segment.sourceStartSeconds) || segment.sourceEndSeconds > source.duration + .05) {
    throw new Error(`片段 ${segment.id} 的源时间越界`);
  }
}

const baseId = safeId(plan.projectId || plan.projectName);
let projectId = baseId;
let suffix = 1;
while (true) {
  try { await access(resolve(root, "public/projects", projectId)); projectId = `${baseId}-${suffix++}`; }
  catch { break; }
}
const first = sources.values().next().value;
const fps = Number.isInteger(plan.fps) ? plan.fps : Math.max(1, Math.round(first.fps || 30));
const projectDir = resolve(root, "public/projects", projectId);
const assetDir = resolve(projectDir, "assets/original");
await mkdir(assetDir, {recursive: true});

const assetBySource = new Map();
for (const [index, source] of [...sources.values()].entries()) {
  const extension = extname(source.absolute).toLowerCase() || ".mp4";
  const assetId = `asset-original-${String(index + 1).padStart(2, "0")}`;
  const destination = resolve(assetDir, `${assetId}${extension}`);
  await copyFile(source.absolute, destination);
  const contentHash = createHash("sha256").update(await readFile(destination)).digest("hex");
  assetBySource.set(source.absolute, {
    id: assetId,
    type: "video",
    sourcePath: `projects/${projectId}/assets/original/${assetId}${extension}`,
    sourceKind: "user-upload",
    licenseStatus: "user_confirmed",
    ingestStatus: "approved",
    contentHash,
    durationInFrames: Math.max(1, Math.round(source.duration * fps)),
    width: source.width,
    height: source.height
  });
}

let timelineCursor = 0;
const clips = plan.segments.map((segment, index) => {
  const asset = assetBySource.get(sourcePath(segment.sourceFile));
  const durationInFrames = Math.max(1, Math.round((segment.sourceEndSeconds - segment.sourceStartSeconds) * fps));
  const clip = {
    id: `clip-a-roll-${String(index + 1).padStart(2, "0")}`,
    type: "video",
    trackId: "track-aroll",
    from: timelineCursor,
    durationInFrames,
    sourceInFrames: Math.max(0, Math.round(segment.sourceStartSeconds * fps)),
    assetId: asset.id,
    props: {muted: false, fit: "cover", roughCutLabel: segment.label, roughCutReason: segment.reason},
    transform: {x: 0, y: 0, width: first.width, height: first.height, scale: 1, rotation: 0, opacity: 1, zIndex: 0},
    enabled: true,
    origin: {kind: "director", sourceId: segment.id}
  };
  timelineCursor += durationInFrames;
  return clip;
});
const now = new Date().toISOString();
const project = {
  schemaVersion: "project-document/1",
  projectId,
  name: plan.projectName,
  status: "candidate_not_approved",
  settings: {
    width: first.width,
    height: first.height,
    fps,
    durationInFrames: timelineCursor,
    orientation: first.width > first.height ? "horizontal" : "vertical"
  },
  assets: [...assetBySource.values()],
  tracks: [
    {id: "track-aroll", type: "video", name: "口播原片", order: 10, enabled: true, locked: false},
    {id: "track-overlays", type: "overlay", name: "动效与素材", order: 30, enabled: true, locked: false},
    {id: "track-captions", type: "caption", name: "中文字幕", order: 40, enabled: true, locked: false}
  ],
  clips,
  shotNodes: clips.map((clip, index) => ({id: `shot-${String(index + 1).padStart(2, "0")}`, label: plan.segments[index].label, from: clip.from, durationInFrames: clip.durationInFrames, sourceId: plan.segments[index].id})),
  directorPlanRef: {path: relative(root, planPath), version: plan.schemaVersion},
  styleProfileRef: {id: "ajiunotes-tech-console-v1", version: "0.1.0"},
  templateRegistryVersion: "ajiunotes-tech-registry/0.6.0",
  createdAt: now,
  updatedAt: now
};
await writeFile(resolve(projectDir, "project.json"), `${JSON.stringify(project, null, 2)}\n`, {flag: "wx"});
console.log(JSON.stringify({projectId, projectPath: resolve(projectDir, "project.json")}, null, 2));
