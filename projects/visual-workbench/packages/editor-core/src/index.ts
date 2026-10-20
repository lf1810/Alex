import type {CardSfxPresetId, Clip, ProjectDocument} from "@ajiunotes/contracts";

export type EditorHistory = {
  present: ProjectDocument;
  past: ProjectDocument[];
  future: ProjectDocument[];
  lastAction: string;
};

const candidate = (project: ProjectDocument, updatedAt: string): ProjectDocument => {
  const next: ProjectDocument = {...project, status: "candidate_not_approved", updatedAt};
  delete next.approval;
  return next;
};

export const createHistory = (project: ProjectDocument): EditorHistory => ({present: project, past: [], future: [], lastAction: "打开项目"});

export const commitHistory = (history: EditorHistory, project: ProjectDocument, action: string, updatedAt: string): EditorHistory => {
  const next = candidate(project, updatedAt);
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return {present: next, past: [...history.past.slice(-49), history.present], future: [], lastAction: action};
};

export const undoHistory = (history: EditorHistory): EditorHistory => {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {present: previous, past: history.past.slice(0, -1), future: [history.present, ...history.future.slice(0, 49)], lastAction: "撤销"};
};

export const redoHistory = (history: EditorHistory): EditorHistory => {
  const next = history.future[0];
  if (!next) return history;
  return {present: next, past: [...history.past.slice(-49), history.present], future: history.future.slice(1), lastAction: "重做"};
};

export const replaceClip = (project: ProjectDocument, clip: Clip): ProjectDocument => ({
  ...project,
  clips: project.clips.map((current) => (current.id === clip.id ? clip : current)),
});

export const deleteClip = (project: ProjectDocument, clipId: string): ProjectDocument => ({...project, clips: project.clips.filter((clip) => clip.id !== clipId)});

export const clearCaptionClips = (project: ProjectDocument): ProjectDocument => {
  if (!project.clips.some((clip) => clip.type === "caption")) return project;
  return {...project, clips: project.clips.filter((clip) => clip.type !== "caption")};
};

export const clearMotionClips = (project: ProjectDocument): ProjectDocument => {
  if (!project.clips.some((clip) => clip.type === "template")) return project;
  return {...project, clips: project.clips.filter((clip) => clip.type !== "template")};
};

export const duplicateClip = (project: ProjectDocument, clipId: string, newId: string): ProjectDocument => {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) return project;
  const from = Math.min(project.settings.durationInFrames - clip.durationInFrames, clip.from + Math.max(1, Math.round(project.settings.fps / 3)));
  const copy: Clip = {...structuredClone(clip), id: newId, from: Math.max(0, from), transform: {...clip.transform, zIndex: clip.transform.zIndex + 1}, origin: {kind: "manual", sourceId: clip.id}};
  return {...project, clips: [...project.clips, copy]};
};

export const snapFrame = (value: number, candidates: number[], tolerance = 4): number => {
  let best = value;
  let distance = tolerance + 1;
  for (const candidateFrame of candidates) {
    const current = Math.abs(candidateFrame - value);
    if (current <= tolerance && current < distance) {best = candidateFrame; distance = current;}
  }
  return best;
};

export type TimelineMoveOptions = {
  sameTrackOnly?: boolean;
  preventOverlap?: boolean;
  tolerance?: number;
};

export const timelineSnapCandidates = (project: ProjectDocument, clipId: string, movingDuration: number, sameTrackOnly = false): number[] => {
  const moving = project.clips.find((clip) => clip.id === clipId);
  const candidates = [0, Math.max(0, project.settings.durationInFrames - movingDuration)];
  for (const clip of project.clips) {
    if (clip.id === clipId || !clip.enabled) continue;
    if (sameTrackOnly && moving && clip.trackId !== moving.trackId) continue;
    candidates.push(clip.from, clip.from + clip.durationInFrames, clip.from - movingDuration, clip.from + clip.durationInFrames - movingDuration);
  }
  return [...new Set(candidates.filter((frame) => frame >= 0 && frame <= project.settings.durationInFrames))];
};

const resolveNonOverlappingStart = (project: ProjectDocument, clip: Clip, desiredFrom: number): number => {
  const max = Math.max(0, project.settings.durationInFrames - clip.durationInFrames);
  const peers = project.clips.filter((item) => item.id !== clip.id && item.enabled && item.trackId === clip.trackId).sort((a, b) => a.from - b.from);
  let start = Math.max(0, Math.min(max, desiredFrom));
  for (let attempt = 0; attempt <= peers.length; attempt += 1) {
    const collision = peers.find((item) => start < item.from + item.durationInFrames && start + clip.durationInFrames > item.from);
    if (!collision) return start;
    const before = collision.from - clip.durationInFrames;
    const after = collision.from + collision.durationInFrames;
    const choices = [before, after].filter((value) => value >= 0 && value <= max).sort((a, b) => Math.abs(a - desiredFrom) - Math.abs(b - desiredFrom));
    if (!choices.length) return start;
    start = choices[0] ?? start;
  }
  return start;
};

export const moveClip = (project: ProjectDocument, clipId: string, desiredFrom: number, options: TimelineMoveOptions = {}): Clip | undefined => {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) return undefined;
  const max = project.settings.durationInFrames - clip.durationInFrames;
  const clamped = Math.max(0, Math.min(max, Math.round(desiredFrom)));
  const snapped = snapFrame(clamped, timelineSnapCandidates(project, clipId, clip.durationInFrames, options.sameTrackOnly), options.tolerance ?? 4);
  const from = options.preventOverlap ? resolveNonOverlappingStart(project, clip, snapped) : snapped;
  return {...clip, from};
};

export const trimClipStart = (project: ProjectDocument, clipId: string, desiredFrom: number): Clip | undefined => {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) return undefined;
  const end = clip.from + clip.durationInFrames;
  const earliestSourceFrame = Math.max(0, clip.from - clip.sourceInFrames);
  const from = Math.max(earliestSourceFrame, Math.min(end - 1, Math.round(desiredFrom)));
  const delta = from - clip.from;
  return {...clip, from, durationInFrames: end - from, sourceInFrames: Math.max(0, clip.sourceInFrames + delta)};
};

export const trimClipEnd = (project: ProjectDocument, clipId: string, desiredEnd: number): Clip | undefined => {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) return undefined;
  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  const sourceEnd = asset?.durationInFrames === undefined
    ? project.settings.durationInFrames
    : clip.from + Math.max(1, asset.durationInFrames - clip.sourceInFrames);
  const end = Math.max(clip.from + 1, Math.min(project.settings.durationInFrames, sourceEnd, Math.round(desiredEnd)));
  return {...clip, durationInFrames: end - clip.from};
};

export const rippleTrimProject = (project: ProjectDocument, original: Clip, trimmed: Clip, edge: "start" | "end"): ProjectDocument => {
  const pivot = original.from + original.durationInFrames;
  const selected = edge === "start" ? {...trimmed, from: original.from} : trimmed;
  const selectedEnd = selected.from + selected.durationInFrames;
  const nextSameTrack = project.clips
    .filter((clip) => clip.id !== original.id && clip.enabled && clip.trackId === original.trackId && clip.from > original.from)
    .sort((a, b) => a.from - b.from)[0];
  const rippleFrom = nextSameTrack?.from ?? pivot;
  const shift = selectedEnd - rippleFrom;
  return {
    ...project,
    clips: project.clips.map((clip) => {
      if (clip.id === original.id) return selected;
      if (clip.from < rippleFrom) return clip;
      return {...clip, from: Math.max(0, clip.from + shift)};
    }),
    ...(project.shotNodes ? {shotNodes: project.shotNodes.map((node) => (
      node.from < rippleFrom ? node : {...node, from: Math.max(0, node.from + shift)}
    ))} : {}),
  };
};

export const fitProjectDurationToContent = (project: ProjectDocument): ProjectDocument => {
  const durationInFrames = Math.max(
    1,
    ...project.clips.filter((clip) => clip.enabled).map((clip) => clip.from + clip.durationInFrames),
    ...(project.shotNodes ?? []).map((node) => node.from + node.durationInFrames),
  );
  return {...project, settings: {...project.settings, durationInFrames}};
};

export const updateClipTransform = (clip: Clip, patch: Partial<Clip["transform"]>): Clip => ({...clip, transform: {...clip.transform, ...patch}});

export const updateClipProps = (clip: Clip, patch: Record<string, unknown>): Clip => ({...clip, props: {...clip.props, ...patch}});

export const updateCardSfx = (
  clip: Clip,
  patch: {cardSfxPreset?: CardSfxPresetId; cardSfxVolume?: number},
): Clip => ({
  ...clip,
  props: {
    ...clip.props,
    ...(patch.cardSfxPreset === undefined ? {} : {cardSfxPreset: patch.cardSfxPreset}),
    ...(patch.cardSfxVolume === undefined ? {} : {cardSfxVolume: patch.cardSfxVolume}),
  },
});

export const fitClipToAssetAspect = (
  clip: Clip,
  assetWidth: number | undefined,
  assetHeight: number | undefined,
  canvasWidth: number,
  canvasHeight: number,
): Clip => {
  if (!assetWidth || !assetHeight || assetWidth <= 0 || assetHeight <= 0) return clip;
  const ratio = assetWidth / assetHeight;
  const boxRatio = clip.transform.width / clip.transform.height;
  let width = ratio >= boxRatio ? clip.transform.width : clip.transform.height * ratio;
  let height = ratio >= boxRatio ? clip.transform.width / ratio : clip.transform.height;
  const canvasScale = Math.min(1, canvasWidth * .82 / width, canvasHeight * .82 / height);
  width *= canvasScale;
  height *= canvasScale;
  const centerX = clip.transform.x + clip.transform.width / 2;
  const centerY = clip.transform.y + clip.transform.height / 2;
  const position = {
    x: Math.max(0, Math.min(canvasWidth - width, centerX - width / 2)),
    y: Math.max(0, Math.min(canvasHeight - height, centerY - height / 2)),
  };
  return updateClipTransform(clip, {...position, width, height, scale: 1});
};

export type CanvasResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const resizeClipFromHandle = (
  clip: Clip,
  handle: CanvasResizeHandle,
  deltaX: number,
  deltaY: number,
  canvasWidth: number,
  canvasHeight: number,
  minimumSize = 40,
): Clip => {
  const scale = Math.max(.01, clip.transform.scale);
  const originalWidth = clip.transform.width * scale;
  const originalHeight = clip.transform.height * scale;
  const originalLeft = clip.transform.x + (clip.transform.width - originalWidth) / 2;
  const originalTop = clip.transform.y + (clip.transform.height - originalHeight) / 2;
  const originalRight = originalLeft + originalWidth;
  const originalBottom = originalTop + originalHeight;
  let left = originalLeft;
  let top = originalTop;
  let right = originalRight;
  let bottom = originalBottom;

  if (handle.includes("w")) left = Math.min(originalRight - minimumSize, originalLeft + deltaX);
  if (handle.includes("e")) right = Math.max(originalLeft + minimumSize, originalRight + deltaX);
  if (handle.includes("n")) top = Math.min(originalBottom - minimumSize, originalTop + deltaY);
  if (handle.includes("s")) bottom = Math.max(originalTop + minimumSize, originalBottom + deltaY);

  const width = Math.max(minimumSize, right - left);
  const height = Math.max(minimumSize, bottom - top);
  const position = clampCanvasPosition(left, top, {...clip.transform, width, height, scale: 1}, canvasWidth, canvasHeight);
  return updateClipTransform(clip, {...position, width, height, scale: 1});
};

export const clampCanvasPosition = (
  x: number,
  y: number,
  transform: Clip["transform"],
  canvasWidth: number,
  canvasHeight: number,
  minimumVisible = 28,
) => {
  const scaledWidth = transform.width * transform.scale;
  const scaledHeight = transform.height * transform.scale;
  const visibleX = Math.max(1, Math.min(minimumVisible, scaledWidth));
  const visibleY = Math.max(1, Math.min(minimumVisible, scaledHeight));
  return {
    x: Math.max(-scaledWidth + visibleX, Math.min(canvasWidth - visibleX, x)),
    y: Math.max(-scaledHeight + visibleY, Math.min(canvasHeight - visibleY, y)),
  };
};

export const isClipWithinSafeArea = (clip: Clip, safe: {left: number; right: number; top: number; bottom: number}, width: number, height: number): boolean => {
  const boxRight = clip.transform.x + clip.transform.width * clip.transform.scale;
  const boxBottom = clip.transform.y + clip.transform.height * clip.transform.scale;
  return clip.transform.x >= safe.left && clip.transform.y >= safe.top && boxRight <= width - safe.right && boxBottom <= height - safe.bottom;
};
