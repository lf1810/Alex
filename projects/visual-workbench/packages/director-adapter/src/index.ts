import type {Asset, Clip, ClipTransform, ProjectDocument, ShotNode, Track} from "@ajiunotes/contracts";
import {validateProjectDocument} from "@ajiunotes/contracts";
import {
  TEMPLATE_REGISTRY_VERSION,
  getTemplateDefinition,
  mapEffectTypeToComponentId,
  trustedTemplateIds,
} from "@ajiunotes/template-registry";
import type {
  AdapterOptions,
  DirectorEffect,
  DirectorFormat,
  DirectorPlan,
  DirectorTimedItem,
  DirectorTransform,
} from "./types.js";

export * from "./types.js";

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const TECH_STYLE_VERSION = "0.1.0";

export class DirectorPlanAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectorPlanAdapterError";
  }
}

const assertFinitePositive = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DirectorPlanAdapterError(`${label} must be a positive number`);
  }
};

const assertInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new DirectorPlanAdapterError(`${label} must be a non-negative integer`);
  }
};

const secondsToFrames = (seconds: number, fps: number): number => Math.round(seconds * fps);

const resolveProjectDuration = (format: DirectorFormat): number => {
  assertFinitePositive(format.width, "format.width");
  assertFinitePositive(format.height, "format.height");
  assertFinitePositive(format.fps, "format.fps");

  if (format.durationInFrames !== undefined) {
    assertInteger(format.durationInFrames, "format.durationInFrames");
    if (format.durationInFrames === 0) {
      throw new DirectorPlanAdapterError("format.durationInFrames must be greater than zero");
    }
    if (format.duration !== undefined) {
      assertFinitePositive(format.duration, "format.duration");
      const derived = secondsToFrames(format.duration, format.fps);
      if (Math.abs(derived - format.durationInFrames) > 1) {
        throw new DirectorPlanAdapterError("format.duration conflicts with canonical durationInFrames");
      }
    }
    return format.durationInFrames;
  }

  if (format.duration === undefined) {
    throw new DirectorPlanAdapterError("format requires durationInFrames or duration");
  }
  assertFinitePositive(format.duration, "format.duration");
  return Math.max(1, secondsToFrames(format.duration, format.fps));
};

const resolveTiming = (
  item: DirectorTimedItem,
  fps: number,
  projectDuration: number,
  label: string,
): {from: number; durationInFrames: number} => {
  const hasFrameTiming = item.from !== undefined || item.durationInFrames !== undefined;
  const hasSecondTiming = item.start !== undefined || item.end !== undefined;

  if (hasFrameTiming) {
    if (item.from === undefined || item.durationInFrames === undefined) {
      throw new DirectorPlanAdapterError(`${label} frame timing requires from and durationInFrames`);
    }
    assertInteger(item.from, `${label}.from`);
    assertInteger(item.durationInFrames, `${label}.durationInFrames`);
    if (item.durationInFrames === 0) {
      throw new DirectorPlanAdapterError(`${label}.durationInFrames must be greater than zero`);
    }
    if (hasSecondTiming) {
      if (item.start === undefined || item.end === undefined || item.end <= item.start) {
        throw new DirectorPlanAdapterError(`${label} compatibility seconds require valid start and end`);
      }
      const derivedFrom = secondsToFrames(item.start, fps);
      const derivedDuration = secondsToFrames(item.end - item.start, fps);
      if (
        Math.abs(derivedFrom - item.from) > 1 ||
        Math.abs(derivedDuration - item.durationInFrames) > 1
      ) {
        throw new DirectorPlanAdapterError(`${label} compatibility seconds conflict with canonical frame timing`);
      }
    }
    if (item.from + item.durationInFrames > projectDuration) {
      throw new DirectorPlanAdapterError(`${label} exceeds project duration`);
    }
    return {from: item.from, durationInFrames: item.durationInFrames};
  }

  if (item.start === undefined || item.end === undefined || item.end <= item.start) {
    throw new DirectorPlanAdapterError(`${label} requires valid timing`);
  }
  const from = Math.max(0, secondsToFrames(item.start, fps));
  const durationInFrames = Math.max(1, secondsToFrames(item.end - item.start, fps));
  if (from + durationInFrames > projectDuration) {
    throw new DirectorPlanAdapterError(`${label} exceeds project duration`);
  }
  return {from, durationInFrames};
};

const coordinateUnit = (transform: DirectorTransform | undefined): "normalized" | "pixels" | null => {
  if (!transform) return null;
  const values = [transform.x, transform.y, transform.width, transform.height].filter(
    (value): value is number => value !== undefined,
  );
  if (values.length === 0) return null;
  return values.some((value) => Math.abs(value) > 2) ? "pixels" : "normalized";
};

const resolveTransformUnit = (
  effects: DirectorEffect[],
  requested: AdapterOptions["transformUnit"] = "auto",
): "normalized" | "pixels" => {
  if (requested === "normalized" || requested === "pixels") return requested;
  const units = new Set(effects.map((effect) => coordinateUnit(effect.transform)).filter(Boolean));
  if (units.size > 1) {
    throw new DirectorPlanAdapterError("director plan mixes normalized and pixel transforms");
  }
  return (units.values().next().value as "normalized" | "pixels" | undefined) ?? "normalized";
};

const defaultTransformFor = (componentId: string, width: number, height: number): ClipTransform => {
  if (componentId === "ajiunotes.tech.caption") {
    return {x: width * 0.12, y: height * 0.79, width: width * 0.76, height: height * 0.14, scale: 1, rotation: 0, opacity: 1, zIndex: 80};
  }
  if (componentId === "ajiunotes.tech.demo-focus" || componentId === "ajiunotes.tech.proof-frame") {
    return {x: width * 0.16, y: height * 0.12, width: width * 0.68, height: height * 0.68, scale: 1, rotation: 0, opacity: 1, zIndex: 40};
  }
  if (componentId === "ajiunotes.tech.result-card" || componentId === "ajiunotes.tech.verdict-card") {
    return {x: width * 0.18, y: height * 0.28, width: width * 0.64, height: height * 0.3, scale: 1, rotation: 0, opacity: 1, zIndex: 50};
  }
  return {x: width * 0.58, y: height * 0.2, width: width * 0.34, height: height * 0.5, scale: 1, rotation: 0, opacity: 1, zIndex: 45};
};

const resolveTransform = (
  transform: DirectorTransform | undefined,
  componentId: string,
  width: number,
  height: number,
  unit: "normalized" | "pixels",
  priority = 50,
): ClipTransform => {
  const fallback = defaultTransformFor(componentId, width, height);
  if (!transform) return {...fallback, zIndex: 100 - priority};

  const convertX = (value: number | undefined, base: number, fallbackValue: number): number => {
    if (value === undefined) return fallbackValue;
    return unit === "normalized" ? value * base : value;
  };

  return {
    x: convertX(transform.x, width, fallback.x),
    y: convertX(transform.y, height, fallback.y),
    width: convertX(transform.width, width, fallback.width),
    height: convertX(transform.height, height, fallback.height),
    scale: transform.scale ?? 1,
    rotation: transform.rotation ?? 0,
    opacity: 1,
    zIndex: transform.z ?? 100 - priority,
  };
};

const slug = (value: string): string => {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "ajiunotes-project";
};

const extension = (path: string): string => path.toLowerCase().split(".").pop() ?? "";

const assetTypeFor = (path: string): Asset["type"] => {
  const ext = extension(path);
  if (["mp4", "mov", "webm", "gif"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) return "image";
  if (["wav", "mp3", "m4a"].includes(ext)) return "audio";
  if (["srt", "vtt"].includes(ext)) return "subtitle";
  return "document";
};

const compactProps = (effect: DirectorEffect, assetId?: string): Record<string, unknown> => {
  const entries: Array<[string, unknown]> = [
    ["text", effect.text],
    ["title", effect.title],
    ["label", effect.label],
    ["position", effect.position],
    ["style", effect.style],
    ["animation", effect.animation],
    ["priority", effect.priority],
    ["mandatory", effect.mandatory],
    ["purpose", effect.purpose ?? effect.reason],
    ["fallback", effect.fallback],
    ["occlusionRisk", effect.occlusion_risk],
    ["assetId", assetId],
  ];
  return {
    ...(effect.props ?? {}),
    ...Object.fromEntries(entries.filter(([, value]) => value !== undefined)),
  };
};

export const adaptDirectorPlanToProjectDocument = (
  plan: DirectorPlan,
  options: AdapterOptions = {},
): ProjectDocument => {
  if (!plan.project_name?.trim()) throw new DirectorPlanAdapterError("project_name is required");
  if (!plan.source?.raw_video?.trim()) throw new DirectorPlanAdapterError("source.raw_video is required");

  const {width, height, fps} = plan.format;
  const durationInFrames = resolveProjectDuration(plan.format);
  const orientation = width > height ? "horizontal" : "vertical";
  const effects = plan.effects ?? [];
  const segments = plan.segments ?? [];
  const transformUnit = resolveTransformUnit(effects, options.transformUnit);
  const timestamp = options.timestamp ?? DEFAULT_TIMESTAMP;

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new DirectorPlanAdapterError("timestamp must be an ISO date-time string");
  }

  const tracks: Track[] = [
    {id: "track-main-video", type: "video", name: "A-roll", order: 0, enabled: true, locked: false, muted: false},
    {id: "track-overlays", type: "overlay", name: "Cards and proof", order: 10, enabled: true, locked: false},
    {id: "track-captions", type: "caption", name: "Captions", order: 20, enabled: true, locked: false},
  ];

  const assets: Asset[] = [
    {
      id: "asset-raw-video",
      type: "video",
      sourcePath: plan.source.raw_video,
      sourceKind: "owned",
      licenseStatus: "owned_or_created",
      ingestStatus: "approved",
      durationInFrames,
      width,
      height,
    },
  ];

  if (plan.source.subtitle_file) {
    assets.push({
      id: "asset-subtitles",
      type: "subtitle",
      sourcePath: plan.source.subtitle_file,
      sourceKind: "owned",
      licenseStatus: "owned_or_created",
      ingestStatus: "approved",
    });
  }

  const clips: Clip[] = [
    {
      id: "clip-main-video",
      type: "video",
      trackId: "track-main-video",
      from: 0,
      durationInFrames,
      sourceInFrames: 0,
      assetId: "asset-raw-video",
      props: {fit: "cover"},
      transform: {x: 0, y: 0, width, height, scale: 1, rotation: 0, opacity: 1, zIndex: 0},
      enabled: true,
      origin: {kind: "director", sourceId: "source.raw_video"},
    },
  ];

  const shotNodes: ShotNode[] = segments.map((segment, index) => {
    const timing = resolveTiming(segment, fps, durationInFrames, `segment ${segment.id}`);
    const label = segment.shot_label?.trim() || segment.title?.trim() || segment.visual_intent?.trim() || segment.role?.trim() || segment.caption?.trim() || segment.narration?.trim() || `镜头 ${index + 1}`;
    return {
      id: `shot-${slug(segment.id)}`,
      label: label.length > 24 ? `${label.slice(0, 24)}…` : label,
      ...timing,
      sourceId: segment.id,
      ...(segment.visual_intent?.trim() ? {visualIntent: segment.visual_intent.trim()} : {}),
    };
  });

  const sourceIds = new Set<string>();
  for (const segment of segments) {
    if (sourceIds.has(segment.id)) throw new DirectorPlanAdapterError(`duplicate director item ID: ${segment.id}`);
    sourceIds.add(segment.id);
    if (!segment.caption?.trim()) continue;
    const timing = resolveTiming(segment, fps, durationInFrames, `segment ${segment.id}`);
    clips.push({
      id: `clip-caption-${slug(segment.id)}`,
      type: "caption",
      trackId: "track-captions",
      ...timing,
      sourceInFrames: 0,
      componentId: "ajiunotes.tech.caption",
      templateVersion: getTemplateDefinition("ajiunotes.tech.caption")?.version ?? "0.1.0",
      props: {text: segment.caption, role: segment.role ?? "spoken-caption"},
      transform: defaultTransformFor("ajiunotes.tech.caption", width, height),
      enabled: true,
      origin: {kind: "director", sourceId: segment.id},
    });
  }

  for (const effect of effects) {
    if (sourceIds.has(effect.id)) throw new DirectorPlanAdapterError(`duplicate director item ID: ${effect.id}`);
    sourceIds.add(effect.id);
    const timing = resolveTiming(effect, fps, durationInFrames, `effect ${effect.id}`);
    const componentId = mapEffectTypeToComponentId(effect.type);
    const definition = getTemplateDefinition(componentId);
    if (!definition) throw new DirectorPlanAdapterError(`untrusted effect mapping: ${effect.type}`);

    const assetPath = effect.asset ?? effect.src;
    const assetId = assetPath ? `asset-effect-${slug(effect.id)}` : undefined;
    if (assetPath && assetId) {
      assets.push({
        id: assetId,
        type: assetTypeFor(assetPath),
        sourcePath: assetPath,
        sourceKind: "user-upload",
        licenseStatus: "unknown",
        ingestStatus: "candidate",
      });
    }

    const baseClip: Clip = {
      id: `clip-effect-${slug(effect.id)}`,
      type: "template",
      trackId: "track-overlays",
      ...timing,
      sourceInFrames: 0,
      componentId,
      templateVersion: definition.version,
      props: compactProps(effect, assetId),
      transform: resolveTransform(effect.transform, componentId, width, height, transformUnit, effect.priority),
      enabled: true,
      origin: {kind: "director", sourceId: effect.id},
    };
    clips.push(assetId ? {...baseClip, assetId} : baseClip);
  }

  const directorPlanRef = {
    path: options.directorPlanPath ?? "06_director/edit_plan_approved.json",
    ...(options.directorPlanHash ? {hash: options.directorPlanHash} : {}),
    ...(plan.schema_version ? {version: plan.schema_version} : {version: "director-plan/1"}),
  };

  const project: ProjectDocument = {
    schemaVersion: "project-document/1",
    projectId: slug(plan.project_name),
    name: plan.project_name,
    status: "candidate_not_approved",
    settings: {width, height, fps, durationInFrames, orientation},
    assets,
    tracks,
    clips,
    ...(shotNodes.length ? {shotNodes} : {}),
    directorPlanRef,
    styleProfileRef: {id: "ajiunotes-tech-console-v1", version: TECH_STYLE_VERSION},
    templateRegistryVersion: TEMPLATE_REGISTRY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const validation = validateProjectDocument(project, {trustedTemplateIds});
  if (!validation.ok) {
    throw new DirectorPlanAdapterError(
      `adapter produced an invalid ProjectDocument: ${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`,
    );
  }
  return project;
};
