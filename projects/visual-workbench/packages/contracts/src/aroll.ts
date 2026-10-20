import type {Asset, Clip, ProjectDocument} from "./types.js";

const primaryArollClips = (project: ProjectDocument): Clip[] =>
  project.clips
    .filter((clip) => clip.enabled && clip.type === "video" && clip.trackId === "track-main-video")
    .sort((left, right) => left.from - right.from || left.id.localeCompare(right.id));

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const seamlessArollPlanSignature = (project: ProjectDocument): string =>
  fnv1a(primaryArollClips(project).map((clip) => [
    clip.id,
    clip.assetId ?? "",
    clip.from,
    clip.durationInFrames,
    clip.sourceInFrames,
  ].join("|")).join(";"));

export const seamlessArollAssetId = (project: ProjectDocument): string =>
  `asset-seamless-aroll-${seamlessArollPlanSignature(project)}`;

export const matchingSeamlessArollAsset = (project: ProjectDocument): Asset | undefined => {
  const expectedId = seamlessArollAssetId(project);
  return project.assets.find((asset) =>
    asset.id === expectedId
    && asset.type === "video"
    && asset.durationInFrames === project.settings.durationInFrames
    && asset.width === project.settings.width
    && asset.height === project.settings.height
    && asset.ingestStatus === "approved"
  );
};

