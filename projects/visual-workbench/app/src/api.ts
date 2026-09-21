import type {MotionPreset, ProjectDocument, StyleProfile, TemplateDefinition} from "@ajiunotes/contracts";
import type {AssetIntegrity} from "@ajiunotes/video-engine";

export type ProjectSummary = {
  projectId: string;
  name: string;
  status: ProjectDocument["status"];
  orientation: ProjectDocument["settings"]["orientation"];
  durationInFrames: number;
  fps: number;
  updatedAt: string;
  readyAssets: number;
  totalAssets: number;
  autosaveCount: number;
};

export type ProjectBundle = {
  project: ProjectDocument;
  styleProfile: StyleProfile;
  templateRegistryVersion: string;
  templateRegistry: TemplateDefinition[];
  assetMap: Record<string, string>;
  integrity: AssetIntegrity[];
};

export type Health = {
  status: string;
  remotionMode: string;
  ffmpeg: boolean;
  ffprobe: boolean;
  storageRoot: string;
};

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

const request = async <T>(url: string, init?: RequestInit, timeoutMs = 8_000): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {...init, signal: init?.signal ?? controller.signal});
    const body = await response.json().catch(() => ({})) as {error?: string};
    if (!response.ok) {
      if (response.status >= 500) throw new Error("本地编导台服务暂时不可用，修改已保存在本机草稿中");
      throw new Error(body.error ?? `请求失败：${response.status}`);
    }
    return body as T;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw new Error("本地编导台服务响应超时，修改已保存在本机草稿中");
    if (cause instanceof TypeError) throw new Error("本地编导台服务已断开，修改已保存在本机草稿中");
    throw cause;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const api = {
  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  health: () => request<Health>("/api/health"),
  project: (projectId: string) => request<ProjectBundle>(`/api/projects/${encodeURIComponent(projectId)}`),
  renameProject: (projectId: string, name: string) => request<ProjectDocument>(`/api/projects/${encodeURIComponent(projectId)}/name`, {
    method: "PATCH",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({name}),
  }),
  deleteProject: (projectId: string) => request<{projectId: string; deleted: boolean}>(`/api/projects/${encodeURIComponent(projectId)}`, {method: "DELETE"}),
  createProjectFromMedia: (files: File[], name?: string) => {
    const data = new FormData();
    files.forEach((file) => data.append("files", file));
    if (name?.trim()) data.set("name", name.trim());
    return request<ProjectDocument>("/api/projects/create-from-media", {method: "POST", body: data}, 180_000);
  },
  attachAsset: (projectId: string, assetId: string, file: File) => {
    const data = new FormData();
    data.set("file", file);
    return request(`/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, {method: "POST", body: data});
  },
  saveProject: (project: ProjectDocument, lastAction: string) => request<{revision: number; fileName: string; savedAt: string}>(`/api/projects/${encodeURIComponent(project.projectId)}`, {
    method: "PUT",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({project, lastAction}),
  }),
  autosaves: (projectId: string) => request<Array<{revision: number; fileName: string; updatedAt: string; lastAction?: string}>>(`/api/projects/${encodeURIComponent(projectId)}/autosaves`),
  restoreAutosave: (projectId: string, revision: number) => request<{project: ProjectDocument}>(`/api/projects/${encodeURIComponent(projectId)}/autosaves/${revision}/restore`, {method: "POST"}),
  openSystemRecording: (projectId: string) => request<{started: boolean; target: string}>(`/api/projects/${encodeURIComponent(projectId)}/recordings/open`, {method: "POST"}),
  recordings: (projectId: string) => request<RecordingSummary[]>(`/api/projects/${encodeURIComponent(projectId)}/recordings`),
  importAssets: (projectId: string, files: File[]) => {
    const data = new FormData();
    files.forEach((file) => data.append("files", file));
    return request<import("@ajiunotes/contracts").Asset[]>(`/api/projects/${encodeURIComponent(projectId)}/assets-import`, {method: "POST", body: data}, 120_000);
  },
  motionPresets: () => request<MotionPreset[]>("/api/motion-presets"),
  saveMotionPreset: (projectId: string, preset: Pick<MotionPreset, "name" | "componentId" | "templateVersion" | "props" | "defaultTransform">) => request<MotionPreset>(`/api/projects/${encodeURIComponent(projectId)}/motion-presets`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(preset)}),
};
