import {existsSync} from "node:fs";
import {delimiter, resolve} from "node:path";

export type MediaTool = "ffmpeg" | "ffprobe";

const environmentKey: Record<MediaTool, string> = {
  ffmpeg: "VISUAL_WORKBENCH_FFMPEG",
  ffprobe: "VISUAL_WORKBENCH_FFPROBE",
};

const executableCandidates = (tool: MediaTool): string[] => {
  const configured = process.env[environmentKey[tool]]?.trim();
  const fromPath = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => resolve(directory, tool));
  return [
    ...(configured ? [configured] : []),
    ...fromPath,
    `/opt/homebrew/bin/${tool}`,
    `/usr/local/bin/${tool}`,
    `/usr/bin/${tool}`,
  ];
};

export const findMediaTool = (tool: MediaTool): string | undefined =>
  executableCandidates(tool).find((candidate) => existsSync(candidate));

export const requireMediaTool = (tool: MediaTool): string => {
  const executable = findMediaTool(tool);
  if (executable) return executable;
  throw new Error(`未找到 ${tool}。请先安装 FFmpeg（macOS 可运行：brew install ffmpeg），然后重新打开编导台。`);
};
