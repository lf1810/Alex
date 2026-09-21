import {createHash} from "node:crypto";
import {execFile, spawn} from "node:child_process";
import {access, mkdir, readFile, readdir, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, extname, resolve, sep} from "node:path";
import {promisify} from "node:util";
import type {Asset, AssetImportRecord, FullVideoReferenceAnalysis, FullVideoSemanticReview, MotionPreset, ProjectDocument, ReferenceRebuildCandidate, StyleReferenceAnalysis, StyleReferenceFrame} from "@ajiunotes/contracts";
import {validateAssetImportRecord, validateFullVideoReferenceAnalysis, validateMotionPreset, validateProjectDocument, validateReferenceRebuildCandidate, validateStyleReferenceAnalysis} from "@ajiunotes/contracts";
import {getStyleProfile} from "@ajiunotes/style-library";
import {TEMPLATE_REGISTRY_VERSION, templateRegistry, trustedTemplateIds, validateTemplateProps} from "@ajiunotes/template-registry";
import {requireMediaTool} from "./media-tools.js";

export const workspaceRoot = process.env.VISUAL_WORKBENCH_ROOT
  ? resolve(process.env.VISUAL_WORKBENCH_ROOT)
  : resolve(import.meta.dirname, "../..");
export const publicRoot = process.env.VISUAL_WORKBENCH_PUBLIC_ROOT
  ? resolve(process.env.VISUAL_WORKBENCH_PUBLIC_ROOT)
  : resolve(workspaceRoot, "public");
export const projectsRoot = resolve(publicRoot, "projects");
const execFileAsync = promisify(execFile);

const safeId = (value: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/.test(value)) throw new Error("项目 ID 仅允许字母、数字、短横线和下划线");
  return value;
};

const inside = (root: string, candidate: string): boolean => candidate === root || candidate.startsWith(`${root}${sep}`);

const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;

const assertTrustedTemplateProps = (project: ProjectDocument) => {
  for (const clip of project.clips) {
    if (clip.type !== "template" || !clip.componentId) continue;
    const result = validateTemplateProps(clip.componentId, clip.props);
    if (!result.ok) throw new Error(`动效 ${clip.id} 参数无效：${result.issues.join("；")}`);
  }
};

export const readProject = async (projectId: string): Promise<ProjectDocument> => {
  const path = resolve(projectsRoot, safeId(projectId), "project.json");
  const project = await json<ProjectDocument>(path);
  const validation = validateProjectDocument(project, {trustedTemplateIds});
  if (!validation.ok) throw new Error(`项目数据校验失败：${validation.issues.map((issue) => issue.message).join("；")}`);
  assertTrustedTemplateProps(project);
  return project;
};

export const buildAssetMap = (project: ProjectDocument): Record<string, string> =>
  Object.fromEntries(project.assets.map((asset) => [asset.id, asset.sourcePath]));

const proxyFileName = (assetId: string): string => `${encodeURIComponent(assetId).replaceAll("%", "_")}.mp4`;

export const editProxyPath = (projectId: string, assetId: string): string =>
  `projects/${safeId(projectId)}/edit-proxies/${proxyFileName(assetId)}`;

const probeVisualAsset = async (absolutePath: string) => {
  const {stdout} = await execFileAsync(requireMediaTool("ffprobe"), [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
    "-of", "json", absolutePath,
  ], {maxBuffer: 1024 * 1024});
  const result = JSON.parse(stdout) as {streams?: Array<{width?: number; height?: number; avg_frame_rate?: string}>; format?: {duration?: string}};
  return {
    width: Number(result.streams?.[0]?.width ?? 0),
    height: Number(result.streams?.[0]?.height ?? 0),
    durationSeconds: Number(result.format?.duration ?? 0),
  };
};

const enrichMissingAssetMetadata = async (project: ProjectDocument): Promise<ProjectDocument> => ({
  ...project,
  assets: await Promise.all(project.assets.map(async (asset) => {
    if ((asset.type !== "video" && asset.type !== "image") || (asset.width && asset.height && (asset.type === "image" || asset.durationInFrames))) return asset;
    try {
      const metadata = await probeVisualAsset(resolve(publicRoot, asset.sourcePath));
      return {
        ...asset,
        ...(metadata.width ? {width: metadata.width} : {}),
        ...(metadata.height ? {height: metadata.height} : {}),
        ...(asset.type === "video" && metadata.durationSeconds > 0 ? {durationInFrames: Math.max(1, Math.round(metadata.durationSeconds * project.settings.fps))} : {}),
      };
    } catch {
      return asset;
    }
  })),
});

const isPrimaryArollAsset = (asset: Asset): boolean =>
  /^asset-original-\d+$/.test(asset.id)
  || asset.id === "asset-raw-video"
  || asset.id.startsWith("asset-seamless-aroll-");

export const ensureMaterialEditProxy = async (project: ProjectDocument, asset: Asset): Promise<string | undefined> => {
  if (asset.type !== "video" || isPrimaryArollAsset(asset)) return undefined;
  const source = resolve(publicRoot, asset.sourcePath);
  const relative = editProxyPath(project.projectId, asset.id);
  const destination = resolve(publicRoot, relative);
  const sourceMetadata = await probeVisualAsset(source);
  if (!sourceMetadata.width || !sourceMetadata.height) return undefined;
  try {
    const [sourceStat, destinationStat, proxyMetadata] = await Promise.all([stat(source), stat(destination), probeVisualAsset(destination)]);
    const sourceRatio = sourceMetadata.width / sourceMetadata.height;
    const proxyRatio = proxyMetadata.width / proxyMetadata.height;
    if (destinationStat.size > 0 && destinationStat.mtimeMs >= sourceStat.mtimeMs && Math.abs(sourceRatio - proxyRatio) < .002 && Math.max(proxyMetadata.width, proxyMetadata.height) <= 1280) return relative;
  } catch {
    // Missing or legacy padded proxies are rebuilt below.
  }
  await mkdir(resolve(destination, ".."), {recursive: true});
  const scale = Math.min(1, 1280 / Math.max(sourceMetadata.width, sourceMetadata.height));
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  const targetWidth = even(sourceMetadata.width * scale);
  const targetHeight = even(sourceMetadata.height * scale);
  const temporary = resolve(destination, `../.${asset.id}.${process.pid}.${Date.now()}.tmp.mp4`);
  await execFileAsync(requireMediaTool("ffmpeg"), [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `fps=${project.settings.fps},scale=${targetWidth}:${targetHeight}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-g", String(Math.max(15, project.settings.fps)), "-keyint_min", String(Math.max(15, project.settings.fps)), "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart", temporary,
  ], {maxBuffer: 16 * 1024 * 1024});
  await rename(temporary, destination);
  return relative;
};

export const buildPreviewAssetMap = async (
  project: ProjectDocument,
  fileExists: (absolutePath: string) => Promise<boolean> = async (absolutePath) => {
    try { await access(absolutePath); return true; } catch { return false; }
  },
): Promise<Record<string, string>> => {
  const entries = await Promise.all(project.assets.map(async (asset) => {
    if (asset.type !== "video") return [asset.id, asset.sourcePath] as const;
    const candidates = [asset.derived?.proxyPath, editProxyPath(project.projectId, asset.id)].filter((path): path is string => Boolean(path));
    for (const candidate of candidates) {
      const absolute = resolve(publicRoot, candidate);
      if (inside(publicRoot, absolute) && await fileExists(absolute)) return [asset.id, candidate] as const;
    }
    return [asset.id, asset.sourcePath] as const;
  }));
  return Object.fromEntries(entries);
};

export const assetIntegrity = async (project: ProjectDocument) =>
  Promise.all(
    project.assets.map(async (asset) => {
      const fullPath = resolve(publicRoot, asset.sourcePath);
      if (!inside(publicRoot, fullPath)) return {assetId: asset.id, sourcePath: asset.sourcePath, status: "blocked" as const, reason: "素材路径越界"};
      if (asset.ingestStatus === "quarantined" || asset.ingestStatus === "rejected") {
        return {assetId: asset.id, sourcePath: asset.sourcePath, status: "blocked" as const, reason: `素材状态：${asset.ingestStatus}`};
      }
      try {
        await access(fullPath);
        return {assetId: asset.id, sourcePath: asset.sourcePath, status: "ready" as const};
      } catch {
        return {assetId: asset.id, sourcePath: asset.sourcePath, status: "missing" as const, reason: "本地素材不存在"};
      }
    }),
  );

export const listProjects = async () => {
  await mkdir(projectsRoot, {recursive: true});
  const entries = await readdir(projectsRoot, {withFileTypes: true});
  const summaries = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const project = await readProject(entry.name);
      const integrity = await assetIntegrity(project);
      const autosaves = await listAutosaves(project.projectId);
      summaries.push({
        projectId: project.projectId,
        name: project.name,
        status: project.status,
        orientation: project.settings.orientation,
        durationInFrames: project.settings.durationInFrames,
        fps: project.settings.fps,
        updatedAt: project.updatedAt,
        readyAssets: integrity.filter((item) => item.status === "ready").length,
        totalAssets: integrity.length,
        autosaveCount: autosaves.length,
      });
    } catch {
      // Invalid directories stay off the project center instead of crashing it.
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const normalizeProjectName = (value: unknown): string => {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new Error("项目名称不能为空");
  if (name.length > 80) throw new Error("项目名称不能超过 80 个字符");
  return name;
};

export const renameProject = async (projectId: string, value: unknown): Promise<ProjectDocument> => {
  const id = safeId(projectId);
  const project = await readProject(id);
  const name = normalizeProjectName(value);
  const renamed: ProjectDocument = {...project, name, updatedAt: new Date().toISOString()};
  const validation = validateProjectDocument(renamed, {trustedTemplateIds});
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await atomicWriteJson(resolve(projectsRoot, id, "project.json"), renamed);
  return renamed;
};

export const deleteProject = async (projectId: string) => {
  const id = safeId(projectId);
  const directory = resolve(projectsRoot, id);
  await access(resolve(directory, "project.json"));
  await rm(directory, {recursive: true, force: false});
  return {projectId: id, deleted: true};
};

export type AutosaveSummary = {revision: number; fileName: string; updatedAt: string; lastAction?: string};

export type RecordingSummary = {
  id: string;
  fileName: string;
  sourcePath: string;
  createdAt: string;
  durationSeconds: number;
  durationInFrames: number;
  width: number;
  height: number;
  mimeType: "video/quicktime" | "video/mp4" | "video/webm";
};

export type PreReviewSuggestion = {
  id: string;
  severity: "high" | "medium" | "low";
  category: "opening" | "evidence" | "rhythm" | "readability" | "technical" | "workflow";
  frame: number;
  clipId?: string;
  title: string;
  suggestion: string;
};

export type EditingExperienceTemplate = {
  schemaVersion: "ajiunotes-editing-experience/1";
  id: string;
  name: string;
  sourceProjectId: string;
  createdAt: string;
  styleProfileRef?: ProjectDocument["styleProfileRef"];
  motionPresets: string[];
  componentIds: string[];
  visualRules: string[];
};

export type MotionPresetDraft = Pick<MotionPreset, "name" | "componentId" | "templateVersion" | "props" | "defaultTransform">;

const recordingDirectory = (projectId: string) => resolve(projectsRoot, safeId(projectId), "recordings", "inbox");

export const openSystemRecording = async (projectId: string) => {
  const project = await readProject(projectId);
  const directory = recordingDirectory(project.projectId);
  await mkdir(directory, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = resolve(directory, `screen-${stamp}.mov`);
  const child = spawn("/usr/sbin/screencapture", ["-i", "-v", "-g", "-k", target], {detached: true, stdio: "ignore"});
  child.unref();
  return {started: true, target: `projects/${project.projectId}/recordings/inbox/${basename(target)}`};
};

export const listRecordings = async (projectId: string): Promise<RecordingSummary[]> => {
  const project = await readProject(projectId);
  const directory = recordingDirectory(project.projectId);
  await mkdir(directory, {recursive: true});
  const entries = await readdir(directory, {withFileTypes: true});
  const recordings: RecordingSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/[.](mov|mp4|m4v|webm)$/i.test(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (!inside(directory, absolute)) continue;
    try {
      const [{stdout}, fileStat] = await Promise.all([
        execFileAsync(requireMediaTool("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", absolute], {maxBuffer: 1024 * 1024}),
        stat(absolute),
      ]);
      const probe = JSON.parse(stdout) as {streams?: Array<{width?: number; height?: number}>; format?: {duration?: string}};
      const durationSeconds = Number(probe.format?.duration ?? 0);
      const extension = extname(entry.name).toLowerCase();
      recordings.push({
        id: `recording-${entry.name.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        fileName: entry.name,
        sourcePath: `projects/${project.projectId}/recordings/inbox/${entry.name}`,
        createdAt: fileStat.mtime.toISOString(),
        durationSeconds,
        durationInFrames: Math.max(1, Math.round(durationSeconds * project.settings.fps)),
        width: Number(probe.streams?.[0]?.width ?? project.settings.width),
        height: Number(probe.streams?.[0]?.height ?? project.settings.height),
        mimeType: extension === ".mp4" || extension === ".m4v" ? "video/mp4" : extension === ".webm" ? "video/webm" : "video/quicktime",
      });
    } catch {
      // Recording may still be in progress; hide it until ffprobe can read it.
    }
  }
  return recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const createPreflightPacket = async (projectId: string, value: unknown) => {
  const validation = validateProjectDocument(value, {trustedTemplateIds});
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  const project = value as ProjectDocument;
  if (project.projectId !== safeId(projectId)) throw new Error("请求项目 ID 与 ProjectDocument 不一致");
  const directory = resolve(projectsRoot, project.projectId, "preflight");
  await mkdir(directory, {recursive: true});
  const existing = (await readdir(directory)).filter((name) => /^preflight_input\.v\d{4}\.json$/.test(name));
  const revision = existing.reduce((max, name) => Math.max(max, Number(name.match(/v(\d{4})/)?.[1] ?? 0)), 0) + 1;
  const fileName = `preflight_input.v${String(revision).padStart(4, "0")}.json`;
  const packet = {
    schemaVersion: "ajiunotes-preflight-input/1",
    createdAt: new Date().toISOString(),
    status: "awaiting_skill_review",
    project,
    summary: {
      durationSeconds: project.settings.durationInFrames / project.settings.fps,
      recordingClips: project.clips.filter((clip) => clip.type === "video" && clip.props.recording === true).length,
      proofClips: project.clips.filter((clip) => clip.type === "template" && String(clip.componentId).includes("proof")).length,
      captions: project.clips.filter((clip) => clip.type === "caption").length,
    },
    auditDimensions: ["首帧视觉理解", "3–5 秒继续观看理由", "证据到达与证据链", "信息推进与再钩子", "普通人相关性", "案例可读性", "关注理由", "标题封面开头一致性", "事实边界", "技术 QA"],
    instruction: `请使用 ajiunotes-production-pipeline 对项目 ${project.projectId} 执行 Stage 8 可修改盲审。`,
  };
  await writeFile(resolve(directory, fileName), `${JSON.stringify(packet, null, 2)}\n`, {flag: "wx"});
  return {revision, fileName, relativePath: `projects/${project.projectId}/preflight/${fileName}`, createdAt: packet.createdAt, instruction: packet.instruction};
};

export const buildPreReviewSuggestions = (project: ProjectDocument): PreReviewSuggestion[] => {
  const suggestions: PreReviewSuggestion[] = [];
  const fps = project.settings.fps;
  const enabled = project.clips.filter((clip) => clip.enabled);
  const overlays = enabled.filter((clip) => clip.type === "template" || clip.type === "caption" || clip.type === "image");
  const proofClips = enabled.filter((clip) => String(clip.componentId ?? "").includes("proof") || String(clip.componentId ?? "").includes("demo-focus"));
  const openingVisuals = overlays.filter((clip) => clip.from <= 0 && clip.from + clip.durationInFrames > 0);
  if (!openingVisuals.length) suggestions.push({id: "opening-no-visual", severity: "high", category: "opening", frame: 0, title: "首帧缺少可读的视觉承诺", suggestion: "在开场镜头加入能证明结果、冲突或反常识判断的画面或短卡片，并与第一句话同步。"});
  if (!proofClips.length) suggestions.push({id: "evidence-missing", severity: "high", category: "evidence", frame: 0, title: "当前项目没有明确的证明画面", suggestion: "把原始页面、操作过程、结果截图或录屏放进对应镜头，避免只依靠口播结论。"});
  for (const clip of proofClips.filter((item) => item.durationInFrames < Math.round(fps * 1.2)).slice(0, 2)) suggestions.push({id: `proof-short-${clip.id}`, severity: "medium", category: "evidence", frame: clip.from, clipId: clip.id, title: "证明画面停留时间偏短", suggestion: "确认手机端能看清关键字段；必要时延长停留、裁掉无关区域或增加聚焦高亮。"});
  const safeX = project.settings.width * .05;
  const safeY = project.settings.height * .05;
  for (const clip of overlays.filter((item) => item.transform.x < safeX || item.transform.y < safeY || item.transform.x + item.transform.width * item.transform.scale > project.settings.width - safeX || item.transform.y + item.transform.height * item.transform.scale > project.settings.height - safeY).slice(0, 4)) suggestions.push({id: `safe-${clip.id}`, severity: "medium", category: "readability", frame: clip.from, clipId: clip.id, title: "字幕或卡片靠近画面边缘", suggestion: "点击定位后直接在画布拖动或缩放，给平台 UI 和手机裁切保留安全距离。"});
  for (const clip of enabled.filter((item) => item.type === "caption" && String(item.props.text ?? "").length > 26).slice(0, 3)) suggestions.push({id: `caption-${clip.id}`, severity: "medium", category: "readability", frame: clip.from, clipId: clip.id, title: "单条字幕信息量过大", suggestion: "拆成更短的语义单元，保留关键词，避免观众同时读长句又看案例。"});
  const videoEnds = enabled.filter((clip) => clip.type === "video" && !clip.props.recording).map((clip) => clip.from + clip.durationInFrames);
  const arollEnd = videoEnds.length ? Math.max(...videoEnds) : 0;
  if (arollEnd < project.settings.durationInFrames - fps) suggestions.push({id: "aroll-gap", severity: "high", category: "technical", frame: arollEnd, title: "主拍摄素材没有覆盖完整时间线", suggestion: "在这个位置补齐主拍摄片段，或缩短项目总时长；否则后段只剩背景和零散动效。"});
  if (!(project.shotNodes?.length)) suggestions.push({id: "shot-nodes-missing", severity: "medium", category: "workflow", frame: 0, title: "缺少拍摄稿镜头节点", suggestion: "从已批准的拍摄稿或导演计划重新生成 ProjectDocument，节点不应由录屏素材推断。"});
  const checkpoints = [...new Set(overlays.flatMap((clip) => [clip.from, clip.from + clip.durationInFrames]).filter((frame) => frame >= 0 && frame < project.settings.durationInFrames))].sort((a, b) => a - b);
  for (const frame of checkpoints) {
    const active = overlays.filter((clip) => clip.from <= frame && clip.from + clip.durationInFrames > frame);
    if (active.length > 3) {
      const clip = active.sort((a, b) => b.transform.zIndex - a.transform.zIndex)[0];
      suggestions.push({id: `overload-${frame}`, severity: "medium", category: "rhythm", frame, ...(clip ? {clipId: clip.id} : {}), title: "同屏信息层级过多", suggestion: "这一拍只保留一个主视觉，其余字幕或卡片错峰出现，避免证明画面与解释卡互相争夺注意力。"});
      break;
    }
  }
  if (!suggestions.length) suggestions.push({id: "manual-watch", severity: "low", category: "workflow", frame: 0, title: "未发现结构性阻断项", suggestion: "仍需人工完整观看，确认口播节奏、证据同步和第一视角观看感受。"});
  return suggestions.slice(0, 12);
};

export const createPreflightReview = async (projectId: string, value: unknown) => {
  const validation = validateProjectDocument(value, {trustedTemplateIds});
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  const project = value as ProjectDocument;
  if (project.projectId !== safeId(projectId)) throw new Error("请求项目 ID 与 ProjectDocument 不一致");
  const directory = resolve(projectsRoot, project.projectId, "preflight");
  await mkdir(directory, {recursive: true});
  const existing = (await readdir(directory)).filter((name) => /^preflight_result\.v\d{4}\.json$/.test(name));
  const revision = existing.reduce((max, name) => Math.max(max, Number(name.match(/v(\d{4})/)?.[1] ?? 0)), 0) + 1;
  const fileName = `preflight_result.v${String(revision).padStart(4, "0")}.json`;
  const suggestions = buildPreReviewSuggestions(project);
  const high = suggestions.filter((item) => item.severity === "high").length;
  const medium = suggestions.filter((item) => item.severity === "medium").length;
  const result = {schemaVersion: "ajiunotes-preflight-result/1", createdAt: new Date().toISOString(), projectId: project.projectId, projectUpdatedAt: project.updatedAt, riskTier: high ? "高风险" : medium >= 3 ? "中风险" : "低风险", suggestions};
  await writeFile(resolve(directory, fileName), `${JSON.stringify(result, null, 2)}\n`, {flag: "wx"});
  return {revision, fileName, relativePath: `projects/${project.projectId}/preflight/${fileName}`, createdAt: result.createdAt, riskTier: result.riskTier, suggestions};
};

export const listAutosaves = async (projectId: string): Promise<AutosaveSummary[]> => {
  const directory = resolve(projectsRoot, safeId(projectId), "autosave");
  try {
    const entries = await readdir(directory, {withFileTypes: true});
    const results: AutosaveSummary[] = [];
    for (const entry of entries) {
      const match = entry.isFile() ? entry.name.match(/^project_document_candidate\.v(\d{4})\.json$/) : null;
      if (!match?.[1]) continue;
      const snapshot = await json<{project: ProjectDocument; metadata?: {lastAction?: string}}>(resolve(directory, entry.name));
      results.push({revision: Number.parseInt(match[1], 10), fileName: entry.name, updatedAt: snapshot.project.updatedAt, ...(snapshot.metadata?.lastAction ? {lastAction: snapshot.metadata.lastAction} : {})});
    }
    return results.sort((a, b) => b.revision - a.revision);
  } catch {
    return [];
  }
};

const atomicWriteJson = async (path: string, value: unknown) => {
  const temporary = `${path}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {flag: "wx"});
  await rename(temporary, path);
};

export const saveCandidateProject = async (projectId: string, value: unknown, lastAction = "编辑项目") => {
  const validation = validateProjectDocument(value, {trustedTemplateIds});
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  const project = value as ProjectDocument;
  assertTrustedTemplateProps(project);
  if (project.projectId !== safeId(projectId)) throw new Error("请求项目 ID 与 ProjectDocument 不一致");
  if (project.status !== "candidate_not_approved" || project.approval) throw new Error("编辑保存必须是未批准候选项目");
  const projectDir = resolve(projectsRoot, project.projectId);
  await access(resolve(projectDir, "project.json"));
  const autosaveDir = resolve(projectDir, "autosave");
  await mkdir(autosaveDir, {recursive: true});
  const existing = await listAutosaves(project.projectId);
  const revision = (existing[0]?.revision ?? 0) + 1;
  const fileName = `project_document_candidate.v${String(revision).padStart(4, "0")}.json`;
  const snapshot = {schemaVersion: "ajiunotes-autosave/1", project, metadata: {lastAction, savedAt: new Date().toISOString()}};
  await writeFile(resolve(autosaveDir, fileName), `${JSON.stringify(snapshot, null, 2)}\n`, {flag: "wx"});
  await atomicWriteJson(resolve(projectDir, "project.json"), project);
  return {revision, fileName, savedAt: snapshot.metadata.savedAt};
};

export const restoreAutosave = async (projectId: string, revision: number) => {
  const id = safeId(projectId);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("恢复版本号无效");
  const fileName = `project_document_candidate.v${String(revision).padStart(4, "0")}.json`;
  const snapshot = await json<{project: ProjectDocument}>(resolve(projectsRoot, id, "autosave", fileName));
  const current = await readProject(id);
  await saveCandidateProject(id, current, "恢复前自动保护当前项目");
  const project: ProjectDocument = {...snapshot.project, status: "candidate_not_approved", updatedAt: new Date().toISOString()};
  delete project.approval;
  const saved = await saveCandidateProject(id, project, `恢复自动保存 v${String(revision).padStart(4, "0")}`);
  return {project, saved};
};

export const projectBundle = async (projectId: string) => {
  const project = await enrichMissingAssetMetadata(await readProject(projectId));
  for (const asset of project.assets) {
    if (asset.type === "video" && !isPrimaryArollAsset(asset)) {
      try { await ensureMaterialEditProxy(project, asset); } catch { /* Fall back to the untouched source when proxy generation fails. */ }
    }
  }
  const styleRef = project.styleProfileRef;
  const styleProfile = styleRef ? getStyleProfile(styleRef.id, styleRef.version) : undefined;
  if (!styleProfile) throw new Error("项目引用的风格版本不存在");
  return {
    project,
    styleProfile,
    templateRegistryVersion: TEMPLATE_REGISTRY_VERSION,
    templateRegistry,
    // The browser Player receives lightweight, frame-aligned edit proxies when
    // available. Formal RenderJobs continue to call buildAssetMap(snapshot) and
    // therefore always render from the untouched source files.
    assetMap: await buildPreviewAssetMap(project),
    integrity: await assetIntegrity(project),
  };
};

const extensionFor = (originalName: string, mimetype: string): string => {
  const ext = extname(originalName).toLowerCase();
  if (ext && /^[.][a-z0-9]{1,8}$/.test(ext)) return ext;
  if (mimetype === "video/mp4") return ".mp4";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/jpeg") return ".jpg";
  return ".bin";
};

const assetTypeForUpload = (file: Express.Multer.File): Asset["type"] => {
  const extension = extname(file.originalname).toLowerCase();
  if (extension === ".svg" || file.mimetype === "image/svg+xml") throw new Error("SVG 需先完成清理和栅格化，当前不能直接作为项目素材导入");
  if (file.mimetype.startsWith("video/") || [".mov", ".mp4", ".m4v", ".webm"].includes(extension)) return "video";
  if (file.mimetype.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return "image";
  if (file.mimetype.startsWith("audio/") || [".mp3", ".wav", ".m4a", ".aac"].includes(extension)) return "audio";
  if ([".srt", ".vtt", ".ass"].includes(extension)) return "subtitle";
  throw new Error(`暂不支持这个素材格式：${file.originalname}`);
};

export const importOwnedAsset = async (projectId: string, file: Express.Multer.File): Promise<Asset> => {
  const project = await readProject(projectId);
  const digest = createHash("sha256").update(file.buffer).digest("hex");
  const cleanName = basename(file.originalname, extname(file.originalname)).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42) || "material";
  const id = `asset-${cleanName}-${digest.slice(0, 8)}`;
  const ext = extensionFor(file.originalname, file.mimetype);
  const relative = `projects/${project.projectId}/assets/imported/${id}${ext}`;
  const destination = resolve(publicRoot, relative);
  if (!inside(publicRoot, destination)) throw new Error("素材路径越界");
  await mkdir(resolve(destination, ".."), {recursive: true});
  try { await writeFile(destination, file.buffer, {flag: "wx"}); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
  const asset: Asset = {id, type: assetTypeForUpload(file), sourcePath: relative, sourceKind: "user-upload", licenseStatus: "user_confirmed", ingestStatus: "approved", mimeType: file.mimetype || "application/octet-stream", contentHash: digest};
  if (asset.type === "video" || asset.type === "audio" || asset.type === "image") {
    try {
      const {stdout} = await execFileAsync(requireMediaTool("ffprobe"), ["-v", "error", "-select_streams", asset.type === "audio" ? "a:0" : "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", destination], {maxBuffer: 1024 * 1024});
      const probe = JSON.parse(stdout) as {streams?: Array<{width?: number; height?: number}>; format?: {duration?: string}};
      const seconds = Number(probe.format?.duration ?? 0);
      if (seconds > 0) asset.durationInFrames = Math.max(1, Math.round(seconds * project.settings.fps));
      if (probe.streams?.[0]?.width) asset.width = probe.streams[0].width;
      if (probe.streams?.[0]?.height) asset.height = probe.streams[0].height;
    } catch { /* Metadata is optional; the original remains importable. */ }
  }
  if (asset.type === "video") {
    const proxyPath = await ensureMaterialEditProxy(project, asset);
    if (proxyPath) asset.derived = {...asset.derived, proxyPath};
  }
  return asset;
};

const parseFrameRate = (value: string | undefined): number => {
  const [rawNumerator, rawDenominator] = String(value ?? "30/1").split("/");
  const numerator = Number(rawNumerator ?? 30);
  const denominator = Number(rawDenominator ?? 1);
  const rate = denominator ? numerator / denominator : numerator;
  return Number.isFinite(rate) && rate > 0 ? Math.max(1, Math.round(rate)) : 30;
};

const uniqueProjectId = async (requestedName: string): Promise<string> => {
  const latin = requestedName.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const base = safeId(latin.length >= 2 ? latin : `video-project-${Date.now().toString(36)}`);
  let candidate = base;
  let index = 1;
  while (true) {
    try {
      await access(resolve(projectsRoot, candidate));
      candidate = safeId(`${base}-${index++}`);
    } catch {
      return candidate;
    }
  }
};

const nextAutomaticProjectName = async (): Promise<string> => {
  await mkdir(projectsRoot, {recursive: true});
  const entries = await readdir(projectsRoot, {withFileTypes: true});
  let highest = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const project = await readProject(entry.name);
      const match = project.name.match(/^A9[|｜]项目(\d+)$/);
      if (match?.[1]) highest = Math.max(highest, Number.parseInt(match[1], 10));
    } catch {
      // Invalid project folders do not affect the public project counter.
    }
  }
  return `A9|项目${highest + 1}`;
};

export const createProjectFromMedia = async (files: Express.Multer.File[], requestedName?: string): Promise<ProjectDocument> => {
  if (!files.length) throw new Error("没有收到视频文件");
  for (const file of files) {
    if (assetTypeForUpload(file) !== "video") throw new Error(`首页新建项目只接受视频：${file.originalname}`);
  }
  const name = requestedName?.trim() ? normalizeProjectName(requestedName) : await nextAutomaticProjectName();
  const projectId = await uniqueProjectId(name);
  const projectDirectory = resolve(projectsRoot, projectId);
  const originalDirectory = resolve(projectDirectory, "assets", "original");
  await mkdir(originalDirectory, {recursive: true});

  const probed = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    const digest = createHash("sha256").update(file.buffer).digest("hex");
    const extension = extensionFor(file.originalname, file.mimetype);
    const assetId = `asset-original-${String(index + 1).padStart(2, "0")}`;
    const fileName = `${assetId}${extension}`;
    const destination = resolve(originalDirectory, fileName);
    await writeFile(destination, file.buffer, {flag: "wx"});
    const {stdout} = await execFileAsync(requireMediaTool("ffprobe"), [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
      "-of", "json", destination,
    ], {maxBuffer: 1024 * 1024});
    const metadata = JSON.parse(stdout) as {
      streams?: Array<{width?: number; height?: number; avg_frame_rate?: string}>;
      format?: {duration?: string};
    };
    const stream = metadata.streams?.[0];
    const durationSeconds = Number(metadata.format?.duration ?? 0);
    if (!stream?.width || !stream.height || !(durationSeconds > 0)) throw new Error(`无法读取视频信息：${file.originalname}`);
    probed.push({
      assetId,
      relativePath: `projects/${projectId}/assets/original/${fileName}`,
      mimeType: file.mimetype || "video/mp4",
      digest,
      width: stream.width,
      height: stream.height,
      fps: parseFrameRate(stream.avg_frame_rate),
      durationSeconds,
    });
  }

  const first = probed[0]!;
  const fps = first.fps;
  const width = first.width;
  const height = first.height;
  let cursor = 0;
  const assets: Asset[] = [];
  const clips: ProjectDocument["clips"] = [];
  for (const [index, item] of probed.entries()) {
    const durationInFrames = Math.max(1, Math.round(item.durationSeconds * fps));
    assets.push({
      id: item.assetId,
      type: "video",
      sourcePath: item.relativePath,
      sourceKind: "user-upload",
      licenseStatus: "user_confirmed",
      ingestStatus: "approved",
      mimeType: item.mimeType,
      contentHash: item.digest,
      durationInFrames,
      width: item.width,
      height: item.height,
    });
    clips.push({
      id: `clip-a-roll-${String(index + 1).padStart(2, "0")}`,
      type: "video",
      trackId: "track-aroll",
      from: cursor,
      durationInFrames,
      sourceInFrames: 0,
      assetId: item.assetId,
      props: {muted: false, fit: "cover"},
      transform: {x: 0, y: 0, width, height, scale: 1, rotation: 0, opacity: 1, zIndex: 0},
      enabled: true,
      origin: {kind: "import"},
    });
    cursor += durationInFrames;
  }
  const now = new Date().toISOString();
  const project: ProjectDocument = {
    schemaVersion: "project-document/1",
    projectId,
    name,
    status: "candidate_not_approved",
    settings: {
      width,
      height,
      fps,
      durationInFrames: cursor,
      orientation: width > height ? "horizontal" : "vertical",
    },
    assets,
    tracks: [
      {id: "track-aroll", type: "video", name: "口播原片", order: 10, enabled: true, locked: false},
      {id: "track-overlays", type: "overlay", name: "动效与素材", order: 30, enabled: true, locked: false},
      {id: "track-captions", type: "caption", name: "中文字幕", order: 40, enabled: true, locked: false},
    ],
    clips,
    styleProfileRef: {id: "ajiunotes-tech-console-v1", version: "0.1.0"},
    templateRegistryVersion: TEMPLATE_REGISTRY_VERSION,
    createdAt: now,
    updatedAt: now,
  };
  const validation = validateProjectDocument(project, {trustedTemplateIds});
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await writeFile(resolve(projectDirectory, "project.json"), `${JSON.stringify(project, null, 2)}\n`, {flag: "wx"});
  return project;
};

const editingExperienceDirectory = resolve(workspaceRoot, "library", "editing_experiences");

export const listEditingExperiences = async (): Promise<EditingExperienceTemplate[]> => {
  await mkdir(editingExperienceDirectory, {recursive: true});
  const entries = await readdir(editingExperienceDirectory, {withFileTypes: true});
  const items: EditingExperienceTemplate[] = [];
  for (const entry of entries) if (entry.isFile() && entry.name.endsWith(".json")) try { items.push(await json<EditingExperienceTemplate>(resolve(editingExperienceDirectory, entry.name))); } catch { /* Ignore invalid drafts. */ }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const createEditingExperience = async (projectId: string, value: unknown): Promise<EditingExperienceTemplate> => {
  const validation = validateProjectDocument(value, {trustedTemplateIds});
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  const project = value as ProjectDocument;
  if (project.projectId !== safeId(projectId)) throw new Error("请求项目 ID 与 ProjectDocument 不一致");
  await mkdir(editingExperienceDirectory, {recursive: true});
  const createdAt = new Date().toISOString();
  const id = `${project.projectId}-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const motionPresets = [...new Set(project.clips.map((clip) => clip.props.enterPreset).filter((item): item is string => typeof item === "string" && Boolean(item)))];
  const componentIds = [...new Set(project.clips.map((clip) => clip.componentId).filter((item): item is string => Boolean(item)))];
  const visualRules = [
    project.clips.some((clip) => String(clip.componentId).includes("proof")) ? "事实与结果优先使用证明画面" : "本片未使用独立证明画面",
    project.clips.some((clip) => clip.props.recording === true) ? "案例操作使用录屏并配合说明文字" : "本片未使用案例录屏",
    `主要使用 ${componentIds.length} 类可信动效组件与 ${motionPresets.length} 类进入动效`,
    "只记录剪辑风格和视觉语法，不记录任何时间点",
  ];
  const template: EditingExperienceTemplate = {schemaVersion: "ajiunotes-editing-experience/1", id, name: `${project.name} · 剪辑经验`, sourceProjectId: project.projectId, createdAt, ...(project.styleProfileRef ? {styleProfileRef: project.styleProfileRef} : {}), motionPresets, componentIds, visualRules};
  await writeFile(resolve(editingExperienceDirectory, `${id}.json`), `${JSON.stringify(template, null, 2)}\n`, {flag: "wx"});
  return template;
};

const motionPresetDirectory = resolve(workspaceRoot, "library", "motion_presets");

export const listMotionPresets = async (): Promise<MotionPreset[]> => {
  await mkdir(motionPresetDirectory, {recursive: true});
  const entries = await readdir(motionPresetDirectory, {withFileTypes: true});
  const items: MotionPreset[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const item = await json<MotionPreset>(resolve(motionPresetDirectory, entry.name));
      if (validateMotionPreset(item).ok && trustedTemplateIds.has(item.componentId) && validateTemplateProps(item.componentId, item.props).ok) items.push(item);
    } catch { /* Invalid presets stay out of the trusted UI. */ }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const saveMotionPreset = async (projectId: string, value: unknown): Promise<MotionPreset> => {
  const project = await readProject(projectId);
  if (!value || typeof value !== "object") throw new Error("动效预设数据无效");
  const draft = value as MotionPresetDraft;
  if (!trustedTemplateIds.has(draft.componentId)) throw new Error("动效组件不在可信注册表中");
  const propsValidation = validateTemplateProps(draft.componentId, draft.props ?? {});
  if (!propsValidation.ok) throw new Error(`动效参数无效：${propsValidation.issues.join("；")}`);
  const style = project.styleProfileRef ? getStyleProfile(project.styleProfileRef.id, project.styleProfileRef.version) : undefined;
  const enterPreset = draft.props?.enterPreset;
  if (typeof enterPreset === "string" && style && !style.motion.allowedPresets.includes(enterPreset)) throw new Error("进入动效不在当前风格允许列表中");
  const createdAt = new Date().toISOString();
  const id = `motion-${project.projectId}-${createdAt.replace(/[^0-9]/g, "").slice(0, 17)}`;
  const preset: MotionPreset = {schemaVersion: "motion-preset/1", id, name: String(draft.name ?? "").trim() || "未命名动效", status: "approved", componentId: draft.componentId, templateVersion: draft.templateVersion, props: structuredClone(draft.props ?? {}), defaultTransform: structuredClone(draft.defaultTransform), sourceProjectId: project.projectId, createdAt};
  const validation = validateMotionPreset(preset);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await mkdir(motionPresetDirectory, {recursive: true});
  await writeFile(resolve(motionPresetDirectory, `${id}.json`), `${JSON.stringify(preset, null, 2)}\n`, {flag: "wx"});
  return preset;
};

const styleIntakeRoot = resolve(workspaceRoot, "style_intake");
const styleManifestDirectory = resolve(styleIntakeRoot, "manifests");
const styleAnalysisDirectory = resolve(styleIntakeRoot, "analyses");
const styleRebuildDirectory = resolve(styleIntakeRoot, "rebuild_candidates");
const fullVideoAnalysisRoot = resolve(styleIntakeRoot, "full_video_analyses");
const stylePreviewRoot = resolve(publicRoot, "style-reference-previews");

export const REFERENCE_PROMOTION_PHRASE = "我确认仅吸收可复用风格并加入可信动效库";

type StyleIntakeManifest = AssetImportRecord & {originalName?: string; createdAt?: string};

export type StyleIntakeView = StyleIntakeManifest & {
  analysis?: StyleReferenceAnalysis;
  fullVideoAnalysis?: FullVideoReferenceAnalysis;
  latestCandidate?: ReferenceRebuildCandidate;
};

export type ReferenceRebuildDraft = {
  name: string;
  componentId: string;
  templateVersion: string;
  props: Record<string, unknown>;
  defaultTransform: MotionPreset["defaultTransform"];
  durationInFrames: number;
  selectedFrameId?: string;
  purpose: string;
  transferableTraits: string[];
};

const styleManifestPath = (intakeId: string) => resolve(styleManifestDirectory, `${safeId(intakeId)}.json`);
const styleAnalysisPath = (intakeId: string) => resolve(styleAnalysisDirectory, `${safeId(intakeId)}.json`);
const styleCandidatePath = (candidateId: string) => resolve(styleRebuildDirectory, `${safeId(candidateId)}.json`);
const fullVideoAnalysisPath = (intakeId: string) => resolve(fullVideoAnalysisRoot, safeId(intakeId), "analysis.json");

const parseRate = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const [numerator, denominator = "1"] = value.split("/");
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) && result > 0 ? result : undefined;
};

export const referenceCaptureTimes = (durationSeconds: number): number[] => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0.12) return [0];
  const end = Math.max(0, durationSeconds - 0.08);
  return [...new Set([Math.min(0.15, end), durationSeconds * 0.5, end].map((value) => Number(Math.max(0, value).toFixed(3))))];
};

const referenceProbe = async (sourcePath: string) => {
  const {stdout} = await execFileAsync(requireMediaTool("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate:format=duration", "-of", "json", sourcePath], {maxBuffer: 1024 * 1024});
  const result = JSON.parse(stdout) as {streams?: Array<{width?: number; height?: number; avg_frame_rate?: string}>; format?: {duration?: string}};
  const stream = result.streams?.[0];
  if (!stream?.width || !stream.height) throw new Error("无法读取参考素材的画面尺寸");
  const fps = parseRate(stream.avg_frame_rate);
  return {width: stream.width, height: stream.height, durationSeconds: Math.max(0, Number(result.format?.duration ?? 0) || 0), ...(fps ? {fps} : {})};
};

const previewDimensions = (width: number, height: number) => {
  const scale = Math.min(1, 960 / width);
  const nextWidth = Math.max(2, Math.round((width * scale) / 2) * 2);
  const nextHeight = Math.max(2, Math.round((height * scale) / 2) * 2);
  return {width: nextWidth, height: nextHeight};
};

export const generateReferenceDerivatives = async (options: {sourcePath: string; outputDirectory: string; publicRelativeDirectory: string; sourceKind: "image" | "video"; width: number; height: number; durationSeconds: number}) => {
  await mkdir(options.outputDirectory, {recursive: true});
  const dimensions = previewDimensions(options.width, options.height);
  const times = options.sourceKind === "video" ? referenceCaptureTimes(options.durationSeconds) : [0];
  const frames: StyleReferenceFrame[] = [];
  for (const [index, timeSeconds] of times.entries()) {
    const fileName = `frame-${String(index + 1).padStart(3, "0")}.png`;
    const destination = resolve(options.outputDirectory, fileName);
    const seek = options.sourceKind === "video" ? ["-ss", timeSeconds.toFixed(3)] : [];
    await execFileAsync(requireMediaTool("ffmpeg"), ["-y", ...seek, "-i", options.sourcePath, "-frames:v", "1", "-vf", "scale=960:-2:force_original_aspect_ratio=decrease", destination], {maxBuffer: 8 * 1024 * 1024});
    frames.push({id: `frame-${index + 1}`, timeSeconds, relativePath: `${options.publicRelativeDirectory}/${fileName}`, ...dimensions});
  }
  let proxyPath: string | undefined;
  if (options.sourceKind === "video" && options.durationSeconds > 0) {
    const fileName = "proxy.mp4";
    const destination = resolve(options.outputDirectory, fileName);
    await execFileAsync(requireMediaTool("ffmpeg"), ["-y", "-i", options.sourcePath, "-t", Math.min(options.durationSeconds, 12).toFixed(3), "-vf", "scale=960:-2:force_original_aspect_ratio=decrease", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-movflags", "+faststart", destination], {maxBuffer: 16 * 1024 * 1024});
    proxyPath = `${options.publicRelativeDirectory}/${fileName}`;
  }
  return {frames, proxyPath};
};

export const classifyStyleIntake = (file: Pick<Express.Multer.File, "originalname" | "mimetype">): Pick<AssetImportRecord, "detectedType" | "executableRisk" | "licenseStatus" | "disposition" | "notes"> => {
  const extension = extname(file.originalname).toLowerCase();
  const code = [".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".sh", ".command", ".py", ".app", ".dmg", ".pkg", ".exe"];
  const archives = [".zip", ".rar", ".7z", ".tar", ".gz", ".aep", ".mogrt", ".prproj"];
  const fonts = [".ttf", ".otf", ".woff", ".woff2"];
  if (code.includes(extension)) return {detectedType: extension.slice(1) || file.mimetype, executableRisk: "blocked", licenseStatus: "unknown", disposition: "quarantine", notes: ["包含代码或可执行内容，未执行", "需要人工源码与授权审计"]};
  if (archives.includes(extension) || fonts.includes(extension)) return {detectedType: extension.slice(1) || file.mimetype, executableRisk: "review", licenseStatus: "unknown", disposition: "quarantine", notes: ["工程包、压缩包或字体仅隔离保存", "未解包、未安装、未执行"]};
  if (extension === ".svg" || file.mimetype === "image/svg+xml") return {detectedType: file.mimetype || "svg", executableRisk: "review", licenseStatus: "unknown", disposition: "quarantine", notes: ["SVG 可能包含脚本、外链或嵌入内容", "清理并栅格化前不会预览、执行或进入素材库"]};
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || extension === ".gif") return {detectedType: file.mimetype || extension.slice(1), executableRisk: "none", licenseStatus: "reference_only", disposition: "style_reference", notes: ["仅用于提取视觉层级和运动语法", "不会直接进入正式时间线或渲染"]};
  return {detectedType: file.mimetype || extension.slice(1) || "unknown", executableRisk: "review", licenseStatus: "unknown", disposition: "quarantine", notes: ["未知动效参考格式，等待人工分类"]};
};

export const ingestStyleReference = async (file: Express.Multer.File): Promise<AssetImportRecord> => {
  const digest = createHash("sha256").update(file.buffer).digest("hex");
  const classification = classifyStyleIntake(file);
  const id = `style-${digest.slice(0, 12)}`;
  const targetFolder = classification.disposition === "quarantine" ? "quarantine" : "inbox";
  const ext = extensionFor(file.originalname, file.mimetype);
  const originalPath = resolve(styleIntakeRoot, targetFolder, `${id}${ext}`);
  await mkdir(resolve(originalPath, ".."), {recursive: true});
  try { await writeFile(originalPath, file.buffer, {flag: "wx"}); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
  const record: AssetImportRecord = {id, originalPath, contentHash: digest, ...classification, derivedFiles: []};
  const validation = validateAssetImportRecord(record);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await mkdir(styleManifestDirectory, {recursive: true});
  const manifest = resolve(styleManifestDirectory, `${id}.json`);
  try { await writeFile(manifest, `${JSON.stringify({...record, originalName: basename(file.originalname), createdAt: new Date().toISOString()}, null, 2)}\n`, {flag: "wx"}); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
  return record;
};

const readStyleAnalysis = async (intakeId: string): Promise<StyleReferenceAnalysis | undefined> => {
  try {
    const analysis = await json<StyleReferenceAnalysis>(styleAnalysisPath(intakeId));
    return validateStyleReferenceAnalysis(analysis).ok ? analysis : undefined;
  } catch { return undefined; }
};

const readFullVideoAnalysis = async (intakeId: string): Promise<FullVideoReferenceAnalysis | undefined> => {
  try {
    const analysis = await json<FullVideoReferenceAnalysis>(fullVideoAnalysisPath(intakeId));
    return validateFullVideoReferenceAnalysis(analysis).ok ? analysis : undefined;
  } catch { return undefined; }
};

export const listReferenceRebuildCandidates = async (intakeId?: string): Promise<ReferenceRebuildCandidate[]> => {
  await mkdir(styleRebuildDirectory, {recursive: true});
  const entries = await readdir(styleRebuildDirectory, {withFileTypes: true});
  const candidates: ReferenceRebuildCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const candidate = await json<ReferenceRebuildCandidate>(resolve(styleRebuildDirectory, entry.name));
      if (validateReferenceRebuildCandidate(candidate).ok && (!intakeId || candidate.intakeId === intakeId)) candidates.push(candidate);
    } catch { /* Invalid candidate records remain outside the UI. */ }
  }
  return candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const listStyleIntake = async (): Promise<StyleIntakeView[]> => {
  await mkdir(styleManifestDirectory, {recursive: true});
  const entries = await readdir(styleManifestDirectory, {withFileTypes: true});
  const candidates = await listReferenceRebuildCandidates();
  const records: StyleIntakeView[] = [];
  for (const entry of entries) if (entry.isFile() && entry.name.endsWith(".json")) try {
    const record = await json<StyleIntakeManifest>(resolve(styleManifestDirectory, entry.name));
    const analysis = await readStyleAnalysis(record.id);
    const fullVideoAnalysis = await readFullVideoAnalysis(record.id);
    const latestCandidate = candidates.find((candidate) => candidate.intakeId === record.id);
    records.push({...record, ...(analysis ? {analysis} : {}), ...(fullVideoAnalysis ? {fullVideoAnalysis} : {}), ...(latestCandidate ? {latestCandidate} : {})});
  } catch { /* ignore invalid */ }
  return records.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
};

export const collapseTransitionTimes = (values: number[], minimumGapSeconds = .25, maximum = 120): number[] => values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b).reduce<number[]>((items, value) => {
  const previous = items.at(-1);
  if (previous === undefined || value - previous >= minimumGapSeconds) items.push(Number(value.toFixed(3)));
  return items;
}, []).slice(0, maximum);

export const fullVideoContactSheetPlan = (durationSeconds: number, intervalSeconds = 2, capacity = 20) => {
  const totalSamples = Math.max(1, Math.floor(durationSeconds / intervalSeconds));
  return Array.from({length: Math.ceil(totalSamples / capacity)}, (_, index) => {
    const fromSample = index * capacity;
    const frameCount = Math.max(1, Math.min(capacity, totalSamples - fromSample));
    const fromSeconds = fromSample * intervalSeconds;
    return {fromSeconds, toSeconds: Number(Math.min(durationSeconds, fromSeconds + (frameCount - 1) * intervalSeconds).toFixed(3)), frameCount};
  });
};

const detectTransitionTimes = async (sourcePath: string, threshold: number): Promise<number[]> => {
  const filter = `movie='${sourcePath.replaceAll("'", "\\'")}',select=gt(scene\\,${threshold})`;
  const {stdout} = await execFileAsync(requireMediaTool("ffprobe"), ["-v", "error", "-f", "lavfi", filter, "-show_entries", "frame=pts_time", "-of", "csv=p=0"], {maxBuffer: 4 * 1024 * 1024});
  const raw = stdout.split(/\r?\n/).map((value) => Number(value.trim()));
  return collapseTransitionTimes(raw);
};

export const analyzeFullVideoReference = async (intakeId: string): Promise<FullVideoReferenceAnalysis> => {
  const manifest = await json<StyleIntakeManifest>(styleManifestPath(intakeId));
  const {originalName: _originalName, createdAt: _createdAt, ...importRecord} = manifest;
  if (!validateAssetImportRecord(importRecord).ok) throw new Error("参考素材清单无效");
  if (manifest.disposition !== "style_reference" || manifest.executableRisk !== "none" || !manifest.detectedType.startsWith("video/")) throw new Error("完整视频拆解只接受已隔离的纯视频参考");
  const existing = await readFullVideoAnalysis(manifest.id);
  if (existing?.sourceHash === manifest.contentHash) return existing;
  if (!inside(styleIntakeRoot, manifest.originalPath)) throw new Error("参考素材原始路径越界");

  const metadata = await referenceProbe(manifest.originalPath);
  if (metadata.durationSeconds <= 0) throw new Error("无法读取完整视频时长");
  const intervalSeconds = 2;
  const sceneThreshold = .05;
  const columns = 5;
  const rows = 4;
  const capacity = columns * rows;
  const analysisDirectory = resolve(fullVideoAnalysisRoot, manifest.id);
  const publicDirectory = resolve(stylePreviewRoot, manifest.id, "full-video");
  const contactDirectory = resolve(publicDirectory, "contact-sheets");
  const transitionDirectory = resolve(publicDirectory, "transition-strips");
  await Promise.all([mkdir(analysisDirectory, {recursive: true}), mkdir(contactDirectory, {recursive: true}), mkdir(transitionDirectory, {recursive: true})]);

  await execFileAsync(requireMediaTool("ffmpeg"), ["-hide_banner", "-loglevel", "error", "-y", "-i", manifest.originalPath, "-vf", `fps=1/${intervalSeconds},scale=320:180,tile=${columns}x${rows}:padding=3:margin=6:color=0x071018`, "-fps_mode", "vfr", resolve(contactDirectory, "sheet-%03d.jpg")], {maxBuffer: 16 * 1024 * 1024});
  const sheetFiles = (await readdir(contactDirectory)).filter((name) => /^sheet-\d+[.]jpg$/.test(name)).sort();
  const sheetPlan = fullVideoContactSheetPlan(metadata.durationSeconds, intervalSeconds, capacity);
  const contactSheets = sheetFiles.map((fileName, index) => ({id: `sheet-${index + 1}`, ...sheetPlan[index]!, relativePath: `style-reference-previews/${manifest.id}/full-video/contact-sheets/${fileName}`, frameIntervalSeconds: intervalSeconds, columns, rows}));

  const transitionTimes = await detectTransitionTimes(manifest.originalPath, sceneThreshold);
  const transitionStrips = [];
  for (const [index, timeSeconds] of transitionTimes.entries()) {
    const fileName = `transition-${String(index + 1).padStart(3, "0")}.jpg`;
    const startSeconds = Math.max(0, timeSeconds - .8);
    await execFileAsync(requireMediaTool("ffmpeg"), ["-hide_banner", "-loglevel", "error", "-y", "-ss", startSeconds.toFixed(3), "-i", manifest.originalPath, "-t", "1.6", "-vf", "fps=5,scale=256:144,tile=8x1:padding=3:margin=4:color=0x071018", "-frames:v", "1", resolve(transitionDirectory, fileName)], {maxBuffer: 8 * 1024 * 1024});
    transitionStrips.push({id: `transition-${index + 1}`, timeSeconds, relativePath: `style-reference-previews/${manifest.id}/full-video/transition-strips/${fileName}`});
  }

  const now = new Date().toISOString();
  const analysis: FullVideoReferenceAnalysis = {
    schemaVersion: "full-video-reference-analysis/1",
    intakeId: manifest.id,
    sourceHash: manifest.contentHash,
    status: "sampled",
    metadata,
    sampling: {intervalSeconds, sceneThreshold, contactSheetColumns: columns, contactSheetRows: rows},
    contactSheets,
    transitionStrips,
    createdAt: now,
    updatedAt: now,
  };
  const validation = validateFullVideoReferenceAnalysis(analysis);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await writeFile(fullVideoAnalysisPath(manifest.id), `${JSON.stringify(analysis, null, 2)}\n`, {flag: "wx"});
  return analysis;
};

export const registerFullVideoSemanticReview = async (intakeId: string, value: unknown): Promise<FullVideoReferenceAnalysis> => {
  const analysis = await readFullVideoAnalysis(intakeId);
  if (!analysis) throw new Error("请先生成完整视频拆解包");
  if (!value || typeof value !== "object") throw new Error("完整视频语义拆解结果无效");
  const review = structuredClone(value) as FullVideoSemanticReview;
  if (review.reviewedBy !== "codex") throw new Error("完整视频语义拆解必须标记为 Codex 审阅结果");
  for (const pattern of review.patterns ?? []) {
    if (pattern.implementation === "existing_template" && !trustedTemplateIds.has(pattern.recommendedComponentId)) throw new Error(`动效模式 ${pattern.name} 引用了未注册组件`);
    for (const window of pattern.observedWindows ?? []) if (window.toSeconds <= window.fromSeconds || window.toSeconds > analysis.metadata.durationSeconds + .05) throw new Error(`动效模式 ${pattern.name} 的时间窗口无效`);
  }
  const requiredProhibitions = ["不复制原作者标识、口号、字体组合或完整布局", "不把参考原图或原视频加入正式渲染"];
  review.prohibitedElements = [...new Set([...(review.prohibitedElements ?? []), ...requiredProhibitions])];
  const updated: FullVideoReferenceAnalysis = {...analysis, status: "semantic_reviewed", semanticReview: review, updatedAt: new Date().toISOString()};
  const validation = validateFullVideoReferenceAnalysis(updated);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await writeFile(fullVideoAnalysisPath(intakeId), `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
};

export const analyzeStyleReference = async (intakeId: string): Promise<StyleReferenceAnalysis> => {
  const manifest = await json<StyleIntakeManifest>(styleManifestPath(intakeId));
  const {originalName: _originalName, createdAt: _createdAt, ...importRecord} = manifest;
  const manifestValidation = validateAssetImportRecord(importRecord);
  if (!manifestValidation.ok) throw new Error("参考素材清单无效");
  if (manifest.disposition !== "style_reference" || manifest.executableRisk !== "none") throw new Error("只有已隔离为纯图片或视频的参考素材可以拆解");
  const existing = await readStyleAnalysis(manifest.id);
  if (existing?.sourceHash === manifest.contentHash) return existing;
  if (!inside(styleIntakeRoot, manifest.originalPath)) throw new Error("参考素材原始路径越界");
  const sourceKind: "image" | "video" = manifest.detectedType.startsWith("video/") || /(?:gif|webm|mp4|quicktime)/i.test(manifest.detectedType) ? "video" : "image";
  const metadata = await referenceProbe(manifest.originalPath);
  const outputDirectory = resolve(stylePreviewRoot, manifest.id);
  const publicRelativeDirectory = `style-reference-previews/${manifest.id}`;
  const derivatives = await generateReferenceDerivatives({sourcePath: manifest.originalPath, outputDirectory, publicRelativeDirectory, sourceKind, width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds});
  const now = new Date().toISOString();
  const analysis: StyleReferenceAnalysis = {schemaVersion: "style-reference-analysis/1", intakeId: manifest.id, sourceHash: manifest.contentHash, sourceKind, status: "ready_for_review", metadata, previewFrames: derivatives.frames, ...(derivatives.proxyPath ? {proxyPath: derivatives.proxyPath} : {}), suggestedComponentId: sourceKind === "video" ? "ajiunotes.tech.demo-focus" : "ajiunotes.tech.proof-frame", createdAt: now, updatedAt: now};
  const validation = validateStyleReferenceAnalysis(analysis);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await mkdir(styleAnalysisDirectory, {recursive: true});
  await writeFile(styleAnalysisPath(manifest.id), `${JSON.stringify(analysis, null, 2)}\n`);
  const updatedManifest = {...manifest, derivedFiles: [...new Set([...manifest.derivedFiles, ...analysis.previewFrames.map((frame) => frame.relativePath), ...(analysis.proxyPath ? [analysis.proxyPath] : [])])], notes: [...manifest.notes, "已生成安全代理和关键帧，仍为仅参考状态"]};
  await writeFile(styleManifestPath(manifest.id), `${JSON.stringify(updatedManifest, null, 2)}\n`);
  return analysis;
};

const requiredProhibitedElements = ["不复制原作者标识、口号、字体组合或完整布局", "不把参考原图或原视频直接加入正式渲染"];
const referenceAllowedPropKeys = new Set(["title", "text", "detail", "purpose", "accentColor", "enterPreset", "assetId", "accentRole", "speakerCorner", "steps", "modules", "terms", "result", "disclaimer"]);

const containsRemoteUrl = (value: unknown): boolean => {
  if (typeof value === "string") return /^https?:[/][/]/i.test(value);
  if (Array.isArray(value)) return value.some(containsRemoteUrl);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(containsRemoteUrl);
  return false;
};

const validateReferencePresetProps = (project: ProjectDocument, componentId: string, props: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(props)) {
    if (!referenceAllowedPropKeys.has(key)) throw new Error(`参考重建不允许写入属性：${key}`);
    if (containsRemoteUrl(value)) throw new Error("参考重建属性不能包含远程 URL");
  }
  const propsValidation = validateTemplateProps(componentId, props);
  if (!propsValidation.ok) throw new Error(`参考重建组件参数无效：${propsValidation.issues.join("；")}`);
  const style = project.styleProfileRef ? getStyleProfile(project.styleProfileRef.id, project.styleProfileRef.version) : undefined;
  if (typeof props.enterPreset === "string" && style && !style.motion.allowedPresets.includes(props.enterPreset)) throw new Error("参考重建的进入动效不在当前风格允许列表中");
  if (typeof props.assetId === "string") {
    const asset = project.assets.find((item) => item.id === props.assetId);
    if (!asset || asset.ingestStatus !== "approved" || ["reference_only", "unknown", "restricted"].includes(asset.licenseStatus)) throw new Error("参考重建只能引用当前项目中已批准且可正式使用的素材");
  }
};

export const createReferenceRebuildCandidate = async (projectId: string, intakeId: string, value: unknown): Promise<ReferenceRebuildCandidate> => {
  const project = await readProject(projectId);
  const analysis = await readStyleAnalysis(intakeId);
  if (!analysis) throw new Error("请先生成参考素材关键帧并完成拆解准备");
  if (!value || typeof value !== "object") throw new Error("重建候选配置无效");
  const draft = value as ReferenceRebuildDraft;
  const template = templateRegistry.find((item) => item.componentId === draft.componentId && item.version === draft.templateVersion);
  if (!template) throw new Error("只能使用当前可信 Remotion 组件重建参考动效");
  validateReferencePresetProps(project, draft.componentId, draft.props ?? {});
  if (draft.selectedFrameId && !analysis.previewFrames.some((frame) => frame.id === draft.selectedFrameId)) throw new Error("选中的参考帧不属于当前素材");
  const createdAt = new Date().toISOString();
  const candidate: ReferenceRebuildCandidate = {
    schemaVersion: "reference-rebuild-candidate/1",
    id: `rebuild-${analysis.intakeId}-${Date.now().toString(36)}`,
    intakeId: analysis.intakeId,
    sourceHash: analysis.sourceHash,
    sourceProjectId: project.projectId,
    status: "candidate",
    name: String(draft.name ?? "").trim() || "参考重建候选",
    componentId: template.componentId,
    templateVersion: template.version,
    props: structuredClone(draft.props ?? {}),
    defaultTransform: structuredClone(draft.defaultTransform),
    durationInFrames: Math.max(1, Math.round(draft.durationInFrames)),
    ...(draft.selectedFrameId ? {selectedFrameId: draft.selectedFrameId} : {}),
    purpose: String(draft.purpose ?? "").trim() || "提取可复用科技信息层级",
    transferableTraits: [...new Set((draft.transferableTraits ?? []).map(String).map((item) => item.trim()).filter(Boolean))],
    prohibitedElements: requiredProhibitedElements,
    createdAt,
    updatedAt: createdAt,
  };
  const validation = validateReferenceRebuildCandidate(candidate);
  if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await mkdir(styleRebuildDirectory, {recursive: true});
  await writeFile(styleCandidatePath(candidate.id), `${JSON.stringify(candidate, null, 2)}\n`, {flag: "wx"});
  await writeFile(styleAnalysisPath(analysis.intakeId), `${JSON.stringify({...analysis, status: "candidate_created", updatedAt: createdAt}, null, 2)}\n`);
  return candidate;
};

export const promoteReferenceRebuildCandidate = async (candidateId: string, value: unknown): Promise<{candidate: ReferenceRebuildCandidate; preset: MotionPreset}> => {
  if (!value || typeof value !== "object") throw new Error("可信入库配置无效");
  const request = value as {confirmation?: string; preset?: MotionPresetDraft};
  if (request.confirmation !== REFERENCE_PROMOTION_PHRASE) throw new Error(`请输入完整确认语：${REFERENCE_PROMOTION_PHRASE}`);
  const candidate = await json<ReferenceRebuildCandidate>(styleCandidatePath(candidateId));
  if (!validateReferenceRebuildCandidate(candidate).ok || candidate.status !== "candidate") throw new Error("这个重建候选当前不能晋升");
  const manifest = await json<StyleIntakeManifest>(styleManifestPath(candidate.intakeId));
  if (manifest.contentHash !== candidate.sourceHash || manifest.disposition !== "style_reference" || manifest.licenseStatus !== "reference_only") throw new Error("参考素材来源摘要或授权边界不匹配");
  const draft = request.preset;
  if (!draft || !trustedTemplateIds.has(draft.componentId) || draft.componentId !== candidate.componentId || draft.templateVersion !== candidate.templateVersion) throw new Error("晋升时不能切换到未审核组件");
  const project = await readProject(candidate.sourceProjectId);
  validateReferencePresetProps(project, draft.componentId, draft.props ?? {});
  const now = new Date().toISOString();
  const preset: MotionPreset = {
    schemaVersion: "motion-preset/1",
    id: `motion-reference-${candidate.id}-${Date.now().toString(36)}`,
    name: String(draft.name ?? candidate.name).trim() || candidate.name,
    status: "approved",
    componentId: candidate.componentId,
    templateVersion: candidate.templateVersion,
    props: structuredClone(draft.props ?? candidate.props),
    defaultTransform: structuredClone(draft.defaultTransform ?? candidate.defaultTransform),
    sourceProjectId: candidate.sourceProjectId,
    sourceReferenceId: candidate.intakeId,
    sourceReferenceHash: candidate.sourceHash,
    promotionApproval: {approvedBy: "ajiu", approvedAt: now, confirmation: "reference_rebuild_explicit_confirmation"},
    createdAt: now,
  };
  const presetValidation = validateMotionPreset(preset);
  if (!presetValidation.ok) throw new Error(presetValidation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  await mkdir(motionPresetDirectory, {recursive: true});
  await writeFile(resolve(motionPresetDirectory, `${preset.id}.json`), `${JSON.stringify(preset, null, 2)}\n`, {flag: "wx"});
  const promoted: ReferenceRebuildCandidate = {...candidate, status: "promoted", name: preset.name, props: structuredClone(preset.props), defaultTransform: structuredClone(preset.defaultTransform), promotedPresetId: preset.id, updatedAt: now};
  await writeFile(styleCandidatePath(candidate.id), `${JSON.stringify(promoted, null, 2)}\n`);
  const analysis = await readStyleAnalysis(candidate.intakeId);
  if (analysis) await writeFile(styleAnalysisPath(candidate.intakeId), `${JSON.stringify({...analysis, status: "promoted", updatedAt: now}, null, 2)}\n`);
  return {candidate: promoted, preset};
};

export const attachAsset = async (projectId: string, assetId: string, file: Express.Multer.File) => {
  const project = await readProject(projectId);
  const asset = project.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("项目中不存在这个素材引用");
  const digest = createHash("sha256").update(file.buffer).digest("hex");
  const ext = extensionFor(file.originalname, file.mimetype);
  const relative = `projects/${safeId(projectId)}/assets/${assetId}-${digest.slice(0, 12)}${ext}`;
  const destination = resolve(publicRoot, relative);
  if (!inside(publicRoot, destination)) throw new Error("素材路径越界");
  await mkdir(resolve(destination, ".."), {recursive: true});
  await writeFile(destination, file.buffer, {flag: "wx"});

  const updatedAsset: Asset = {
    ...asset,
    sourcePath: relative,
    sourceKind: "user-upload",
    licenseStatus: "user_confirmed",
    ingestStatus: "approved",
    mimeType: file.mimetype || "application/octet-stream",
    contentHash: digest,
  };
  const now = new Date().toISOString();
  const updated: ProjectDocument = {
    ...project,
    status: "candidate_not_approved",
    assets: project.assets.map((item) => (item.id === assetId ? updatedAsset : item)),
    updatedAt: now,
  };
  delete updated.approval;
  const projectPath = resolve(projectsRoot, safeId(projectId), "project.json");
  await writeFile(projectPath, `${JSON.stringify(updated, null, 2)}\n`);
  return {project: updated, asset: updatedAsset, originalName: basename(file.originalname)};
};
