import {execFile} from "node:child_process";
import {access, mkdir, readFile, rename, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, "..");
const publicRoot = resolve(workspaceRoot, "public");
const projectId = process.argv.find((item) => item.startsWith("--project="))?.slice("--project=".length);
const force = process.argv.includes("--force");
const materialsOnly = process.argv.includes("--materials-only");

if (!projectId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/.test(projectId)) {
  throw new Error("用法：pnpm proxy:edit --project=<projectId> [--force] [--materials-only]");
}

const project = JSON.parse(await readFile(resolve(publicRoot, "projects", projectId, "project.json"), "utf8"));
const outputDirectory = resolve(publicRoot, "projects", projectId, "edit-proxies");
await mkdir(outputDirectory, {recursive: true});

const {stdout: encoders} = await execFileAsync("ffmpeg", ["-hide_banner", "-encoders"], {maxBuffer: 4 * 1024 * 1024});
const hardware = /\bh264_videotoolbox\b/.test(encoders);
const width = project.settings.width;
const height = project.settings.height;
const fps = project.settings.fps;
const usedAssetIds = new Set(project.clips.filter((clip) => clip.enabled && clip.assetId).map((clip) => clip.assetId));
const isPrimaryAroll = (asset) => /^asset-original-\d+$/.test(asset.id) || asset.id === "asset-raw-video";
const videos = project.assets.filter((asset) => asset.type === "video" && asset.ingestStatus === "approved" && (usedAssetIds.has(asset.id) || !isPrimaryAroll(asset)) && (!materialsOnly || !isPrimaryAroll(asset)));

const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const proxyFileName = (assetId) => `${encodeURIComponent(assetId).replaceAll("%", "_")}.mp4`;
const fresh = async (source, destination) => {
  if (!await exists(destination)) return false;
  const [sourceStat, destinationStat] = await Promise.all([stat(source), stat(destination)]);
  return destinationStat.size > 0 && destinationStat.mtimeMs >= sourceStat.mtimeMs;
};

for (const [index, asset] of videos.entries()) {
  const source = resolve(publicRoot, asset.sourcePath);
  const destination = resolve(outputDirectory, proxyFileName(asset.id));
  if (!force && await fresh(source, destination)) {
    process.stdout.write(`[${index + 1}/${videos.length}] 已存在：${asset.id}\n`);
    continue;
  }
  const temporary = resolve(outputDirectory, `.${asset.id}.${process.pid}.tmp.mp4`);
  const primary = isPrimaryAroll(asset);
  const {stdout: probeOutput} = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "json", source,
  ], {maxBuffer: 1024 * 1024});
  const probe = JSON.parse(probeOutput);
  const sourceWidth = Number(probe.streams?.[0]?.width ?? width);
  const sourceHeight = Number(probe.streams?.[0]?.height ?? height);
  const materialScale = Math.min(1, 1280 / Math.max(sourceWidth, sourceHeight));
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  const targetWidth = primary ? width : even(sourceWidth * materialScale);
  const targetHeight = primary ? height : even(sourceHeight * materialScale);
  const filter = primary
    ? `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`
    : `fps=${fps},scale=${targetWidth}:${targetHeight}:flags=lanczos,format=yuv420p`;
  const videoArgs = hardware
    ? ["-c:v", "h264_videotoolbox", "-profile:v", "high", "-b:v", primary ? "14000000" : "5000000", "-maxrate", primary ? "18000000" : "7000000", "-bufsize", primary ? "28000000" : "10000000", "-g", String(Math.max(15, fps))]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", primary ? "16" : "23", "-g", String(Math.max(15, fps)), "-keyint_min", String(Math.max(15, fps)), "-sc_threshold", "0"];
  process.stdout.write(`[${index + 1}/${videos.length}] 生成编辑代理：${asset.id} · ${targetWidth}×${targetHeight}${primary ? "" : " · 原比例无黑边"}\n`);
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-map", "0:v:0", "-map", "0:a:0?", "-vf", filter,
    ...videoArgs,
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", temporary,
  ], {maxBuffer: 16 * 1024 * 1024});
  await rename(temporary, destination);
}

process.stdout.write(`完成：${videos.length} 个视频代理；原片未修改。\n`);
