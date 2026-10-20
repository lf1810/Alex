import type {ErrorObject, ValidateFunction} from "ajv";
import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import {
  assetImportRecordSchema,
  fullVideoReferenceAnalysisSchema,
  motionPresetSchema,
  motionSpecSchema,
  performancePreflightRecordSchema,
  projectApprovalManifestSchema,
  projectDocumentSchema,
  referenceRebuildCandidateSchema,
  renderJobSchema,
  styleReferenceAnalysisSchema,
  styleProfileSchema,
  templateDefinitionSchema,
} from "./schemas.js";
import type {
  AssetImportRecord,
  FullVideoReferenceAnalysis,
  MotionSpec,
  MotionPreset,
  PerformancePreflightRecord,
  ProjectDocument,
  ProjectApprovalManifest,
  ReferenceRebuildCandidate,
  RenderJob,
  StyleReferenceAnalysis,
  StyleProfile,
  TemplateDefinition,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

type AjvRuntime = {
  compile: (schema: object) => ValidateFunction;
};

const Ajv2020 = (
  "default" in Ajv2020Module ? Ajv2020Module.default : Ajv2020Module
) as unknown as new (options: Record<string, unknown>) => AjvRuntime;
const addFormats = (
  "default" in addFormatsModule ? addFormatsModule.default : addFormatsModule
) as unknown as (instance: AjvRuntime) => void;

const ajv = new Ajv2020({allErrors: true, strict: false});
addFormats(ajv);

const projectValidator = ajv.compile(projectDocumentSchema);
const styleValidator = ajv.compile(styleProfileSchema);
const templateValidator = ajv.compile(templateDefinitionSchema);
const motionSpecValidator = ajv.compile(motionSpecSchema);
const motionPresetValidator = ajv.compile(motionPresetSchema);
const importRecordValidator = ajv.compile(assetImportRecordSchema);
const fullVideoReferenceAnalysisValidator = ajv.compile(fullVideoReferenceAnalysisSchema);
const styleReferenceAnalysisValidator = ajv.compile(styleReferenceAnalysisSchema);
const referenceRebuildCandidateValidator = ajv.compile(referenceRebuildCandidateSchema);
const projectApprovalManifestValidator = ajv.compile(projectApprovalManifestSchema);
const performancePreflightRecordValidator = ajv.compile(performancePreflightRecordSchema);
const renderJobValidator = ajv.compile(renderJobSchema);

const schemaIssues = (errors: ErrorObject[] | null | undefined): ValidationIssue[] =>
  (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    code: `schema.${error.keyword}`,
    message: error.message ?? "schema validation failed",
  }));

const result = (issues: ValidationIssue[]): ValidationResult =>
  issues.length === 0 ? {ok: true, issues: []} : {ok: false, issues};

const validateWith = <T>(validator: ValidateFunction, value: unknown): ValidationResult => {
  const valid = validator(value);
  return valid ? {ok: true, issues: []} : result(schemaIssues(validator.errors));
};

export const validateStyleProfile = (value: unknown): ValidationResult =>
  validateWith<StyleProfile>(styleValidator, value);

export const validateTemplateDefinition = (value: unknown): ValidationResult =>
  validateWith<TemplateDefinition>(templateValidator, value);

export const validateMotionSpec = (value: unknown): ValidationResult =>
  validateWith<MotionSpec>(motionSpecValidator, value);

export const validateMotionPreset = (value: unknown): ValidationResult =>
  validateWith<MotionPreset>(motionPresetValidator, value);

export const validateAssetImportRecord = (value: unknown): ValidationResult =>
  validateWith<AssetImportRecord>(importRecordValidator, value);

export const validateFullVideoReferenceAnalysis = (value: unknown): ValidationResult => {
  const base = validateWith<FullVideoReferenceAnalysis>(fullVideoReferenceAnalysisValidator, value);
  if (!base.ok) return base;
  const analysis = value as FullVideoReferenceAnalysis;
  const issues: ValidationIssue[] = [];
  for (const sheet of analysis.contactSheets) {
    if (sheet.toSeconds < sheet.fromSeconds || sheet.toSeconds > analysis.metadata.durationSeconds + .05) issues.push({path: `/contactSheets/${sheet.id}`, code: "bounds.full-video-sheet", message: "contact sheet time range must stay inside the reference video"});
  }
  for (const strip of analysis.transitionStrips) if (strip.timeSeconds > analysis.metadata.durationSeconds + .05) issues.push({path: `/transitionStrips/${strip.id}`, code: "bounds.full-video-transition", message: "transition strip must stay inside the reference video"});
  if (analysis.status === "semantic_reviewed" && !analysis.semanticReview) issues.push({path: "/semanticReview", code: "semantic-review.missing", message: "semantic-reviewed analysis requires a semantic review"});
  if (analysis.semanticReview) for (const pattern of analysis.semanticReview.patterns) for (const window of pattern.observedWindows) if (window.toSeconds <= window.fromSeconds || window.toSeconds > analysis.metadata.durationSeconds + .05) issues.push({path: `/semanticReview/patterns/${pattern.id}/observedWindows`, code: "bounds.full-video-pattern", message: "pattern time windows must be ordered and inside the reference video"});
  return result(issues);
};

export const validateStyleReferenceAnalysis = (value: unknown): ValidationResult =>
  validateWith<StyleReferenceAnalysis>(styleReferenceAnalysisValidator, value);

export const validateReferenceRebuildCandidate = (value: unknown): ValidationResult =>
  validateWith<ReferenceRebuildCandidate>(referenceRebuildCandidateValidator, value);

export const validateProjectApprovalManifest = (value: unknown): ValidationResult =>
  validateWith<ProjectApprovalManifest>(projectApprovalManifestValidator, value);

export const validatePerformancePreflightRecord = (value: unknown): ValidationResult =>
  validateWith<PerformancePreflightRecord>(performancePreflightRecordValidator, value);

export const validateRenderJob = (value: unknown): ValidationResult =>
  validateWith<RenderJob>(renderJobValidator, value);

export const validateProjectDocument = (
  value: unknown,
  options: {trustedTemplateIds?: ReadonlySet<string>} = {},
): ValidationResult => {
  const base = validateWith<ProjectDocument>(projectValidator, value);
  if (!base.ok) return base;

  const project = value as ProjectDocument;
  const issues: ValidationIssue[] = [];
  const trackIds = new Set<string>();
  const assetIds = new Set<string>();
  const clipIds = new Set<string>();
  const shotNodeIds = new Set<string>();

  for (const track of project.tracks) {
    if (trackIds.has(track.id)) {
      issues.push({path: `/tracks/${track.id}`, code: "duplicate.track", message: "track ID must be unique"});
    }
    trackIds.add(track.id);
  }

  for (const asset of project.assets) {
    if (assetIds.has(asset.id)) {
      issues.push({path: `/assets/${asset.id}`, code: "duplicate.asset", message: "asset ID must be unique"});
    }
    assetIds.add(asset.id);
  }

  for (const clip of project.clips) {
    if (clipIds.has(clip.id)) {
      issues.push({path: `/clips/${clip.id}`, code: "duplicate.clip", message: "clip ID must be unique"});
    }
    clipIds.add(clip.id);

    if (!trackIds.has(clip.trackId)) {
      issues.push({path: `/clips/${clip.id}/trackId`, code: "reference.track", message: "clip track does not exist"});
    }
    if (clip.assetId && !assetIds.has(clip.assetId)) {
      issues.push({path: `/clips/${clip.id}/assetId`, code: "reference.asset", message: "clip asset does not exist"});
    }
    if (clip.from + clip.durationInFrames > project.settings.durationInFrames) {
      issues.push({path: `/clips/${clip.id}`, code: "bounds.timeline", message: "clip exceeds project duration"});
    }
    if (clip.type === "template") {
      if (!clip.componentId || !clip.templateVersion) {
        issues.push({path: `/clips/${clip.id}`, code: "template.missing", message: "template clip requires componentId and version"});
      } else if (options.trustedTemplateIds && !options.trustedTemplateIds.has(clip.componentId)) {
        issues.push({path: `/clips/${clip.id}/componentId`, code: "template.untrusted", message: "component is not in the trusted registry"});
      }
    }
  }

  for (const node of project.shotNodes ?? []) {
    if (shotNodeIds.has(node.id)) issues.push({path: `/shotNodes/${node.id}`, code: "duplicate.shot-node", message: "shot node ID must be unique"});
    shotNodeIds.add(node.id);
    if (node.from + node.durationInFrames > project.settings.durationInFrames) issues.push({path: `/shotNodes/${node.id}`, code: "bounds.timeline", message: "shot node exceeds project duration"});
  }

  if (project.settings.orientation === "horizontal" && project.settings.width <= project.settings.height) {
    issues.push({path: "/settings/orientation", code: "orientation.horizontal", message: "horizontal project width must exceed height"});
  }
  if (project.settings.orientation === "vertical" && project.settings.height <= project.settings.width) {
    issues.push({path: "/settings/orientation", code: "orientation.vertical", message: "vertical project height must exceed width"});
  }
  if (project.status === "approved_for_render" && !project.approval) {
    issues.push({path: "/approval", code: "approval.missing", message: "approved project requires approval record"});
  }

  return result(issues);
};

export const validateProjectForRender = (
  project: ProjectDocument,
  trustedTemplateIds: ReadonlySet<string>,
): ValidationResult => {
  const base = validateProjectDocument(project, {trustedTemplateIds});
  const issues = base.ok ? [] : [...base.issues];

  if (project.status !== "approved_for_render" || !project.approval) {
    issues.push({path: "/status", code: "render.not-approved", message: "formal render requires an approved ProjectDocument"});
  }

  const usedAssetIds = new Set(project.clips.flatMap((clip) => (clip.assetId ? [clip.assetId] : [])));
  for (const asset of project.assets) {
    if (!usedAssetIds.has(asset.id)) continue;
    if (asset.ingestStatus !== "approved") {
      issues.push({path: `/assets/${asset.id}/ingestStatus`, code: "render.asset-unapproved", message: "used asset is not approved"});
    }
    if (!(["owned_or_created", "licensed", "user_confirmed"] as const).includes(asset.licenseStatus as "owned_or_created" | "licensed" | "user_confirmed")) {
      issues.push({path: `/assets/${asset.id}/licenseStatus`, code: "render.asset-license", message: "used asset license does not permit formal render"});
    }
  }

  return result(issues);
};
