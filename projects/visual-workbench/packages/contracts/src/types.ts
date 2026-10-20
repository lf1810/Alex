export type Orientation = "horizontal" | "vertical";
export type ProjectStatus = "candidate_not_approved" | "approved_for_render";
export type LicenseStatus =
  | "owned_or_created"
  | "licensed"
  | "user_confirmed"
  | "reference_only"
  | "unknown"
  | "restricted";

export type IngestStatus = "candidate" | "approved" | "quarantined" | "rejected";

export type ArtifactRef = {
  path: string;
  hash?: string;
  version?: string;
};

export type VersionedRef = {
  id: string;
  version: string;
};

export type ApprovalRecord = {
  digest: string;
  approvedAt: string;
  approvedBy: "ajiu";
};

export type ProjectApprovalManifest = {
  schemaVersion: "project-approval-manifest/1";
  projectId: string;
  approvalDigest: string;
  snapshotPath: string;
  snapshotHash: string;
  preflightResultPath: string;
  preflightResultHash: string;
  preflightRiskTier: "低风险" | "中风险" | "高风险";
  performancePreflightPath: string;
  performancePreflightHash: string;
  approvedAt: string;
  approvedBy: "ajiu";
  confirmation: "explicit_ui_confirmation";
};

export type PerformancePreflightRecord = {
  schemaVersion: "ajiunotes-performance-preflight/1";
  projectId: string;
  projectUpdatedAt: string;
  projectDigest: string;
  source: "ajiunotes-performance-calibrator";
  riskTier: "high" | "medium" | "low";
  strongestSection: string;
  weakestSection: string;
  scores: Record<"audience_relevance" | "hook_clarity" | "evidence_strength" | "information_progression" | "demo_readability" | "save_reuse_value" | "follow_series_reason" | "trust_voice" | "packaging_match", {score: number; reason: string}>;
  relativeExpectation: string;
  fixes: Array<{priority: number; frame: number; clipId?: string; title: string; expectedImprovement: string}>;
  decision: "revise" | "proceed";
  decisionConfirmedBy: "ajiu";
  createdAt: string;
};

export type Asset = {
  id: string;
  type: "video" | "image" | "audio" | "subtitle" | "font" | "document";
  sourcePath: string;
  sourceKind: "owned" | "licensed-pack" | "user-upload" | "reference-derived";
  licenseStatus: LicenseStatus;
  ingestStatus: IngestStatus;
  mimeType?: string;
  contentHash?: string;
  durationInFrames?: number;
  width?: number;
  height?: number;
  derived?: {
    proxyPath?: string;
    thumbnailPath?: string;
  };
};

export type Track = {
  id: string;
  type: "video" | "overlay" | "caption" | "audio" | "annotation";
  name: string;
  order: number;
  enabled: boolean;
  locked: boolean;
  muted?: boolean;
};

export type ClipTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
  zIndex: number;
};

export type Clip = {
  id: string;
  type: "video" | "image" | "audio" | "caption" | "template";
  trackId: string;
  from: number;
  durationInFrames: number;
  sourceInFrames: number;
  assetId?: string;
  componentId?: string;
  templateVersion?: string;
  props: Record<string, unknown>;
  transform: ClipTransform;
  enabled: boolean;
  origin?: {
    kind: "director" | "manual" | "motion-spec" | "import";
    sourceId?: string;
  };
};

export type ShotNode = {
  id: string;
  label: string;
  from: number;
  durationInFrames: number;
  sourceId?: string;
  visualIntent?: string;
};

export type ProjectDocument = {
  schemaVersion: "project-document/1";
  projectId: string;
  name: string;
  status: ProjectStatus;
  settings: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    orientation: Orientation;
  };
  assets: Asset[];
  tracks: Track[];
  clips: Clip[];
  shotNodes?: ShotNode[];
  directorPlanRef?: ArtifactRef;
  styleProfileRef?: VersionedRef;
  templateRegistryVersion: string;
  approval?: ApprovalRecord;
  createdAt: string;
  updatedAt: string;
};

export type StyleProfile = {
  id: string;
  version: string;
  status: "provisional" | "approved" | "inactive_not_deleted";
  referenceIds: string[];
  tokens: {
    colors: Record<string, string>;
    typography: Record<string, string | number>;
    geometry: Record<string, string | number>;
    effects: Record<string, string | number>;
  };
  motion: {
    allowedPresets: string[];
    defaultEnterFrames: number;
    defaultExitFrames: number;
    reducedMotionFallback: string;
  };
  layoutRules: string[];
  prohibitedImitation: string[];
};

export type TemplateDefinition = {
  componentId: string;
  version: string;
  propsSchemaId: string;
  defaultProps: Record<string, unknown>;
  allowedOutputs: Array<"composition" | "mp4" | "webm-alpha">;
  deterministic: true;
};

export type MotionSpec = {
  id: string;
  status: "candidate";
  componentId: string;
  templateVersion: string;
  from: number;
  durationInFrames: number;
  props: Record<string, unknown>;
  transform: ClipTransform;
  purpose: string;
  fallback?: string;
};

export type MotionPreset = {
  schemaVersion: "motion-preset/1";
  id: string;
  name: string;
  status: "approved";
  componentId: string;
  templateVersion: string;
  props: Record<string, unknown>;
  defaultTransform: Omit<ClipTransform, "zIndex">;
  sourceProjectId: string;
  sourceReferenceId?: string;
  sourceReferenceHash?: string;
  promotionApproval?: {
    approvedBy: "ajiu";
    approvedAt: string;
    confirmation: "reference_rebuild_explicit_confirmation";
  };
  createdAt: string;
};

export type AssetImportRecord = {
  id: string;
  originalPath: string;
  contentHash: string;
  detectedType: string;
  archiveEntries?: number;
  executableRisk: "none" | "review" | "blocked";
  licenseStatus: LicenseStatus;
  disposition:
    | "asset_candidate"
    | "style_reference"
    | "template_rebuild"
    | "quarantine"
    | "reject";
  derivedFiles: string[];
  notes: string[];
};

export type StyleReferenceFrame = {
  id: string;
  timeSeconds: number;
  relativePath: string;
  width: number;
  height: number;
};

export type StyleReferenceAnalysis = {
  schemaVersion: "style-reference-analysis/1";
  intakeId: string;
  sourceHash: string;
  sourceKind: "image" | "video";
  status: "ready_for_review" | "candidate_created" | "promoted";
  metadata: {
    width: number;
    height: number;
    durationSeconds: number;
    fps?: number;
  };
  previewFrames: StyleReferenceFrame[];
  proxyPath?: string;
  suggestedComponentId: string;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceRebuildCandidate = {
  schemaVersion: "reference-rebuild-candidate/1";
  id: string;
  intakeId: string;
  sourceHash: string;
  sourceProjectId: string;
  status: "candidate" | "promoted" | "rejected";
  name: string;
  componentId: string;
  templateVersion: string;
  props: Record<string, unknown>;
  defaultTransform: Omit<ClipTransform, "zIndex">;
  durationInFrames: number;
  selectedFrameId?: string;
  purpose: string;
  transferableTraits: string[];
  prohibitedElements: string[];
  createdAt: string;
  updatedAt: string;
  promotedPresetId?: string;
};

export type FullVideoContactSheet = {
  id: string;
  fromSeconds: number;
  toSeconds: number;
  relativePath: string;
  frameIntervalSeconds: number;
  columns: number;
  rows: number;
  frameCount: number;
};

export type FullVideoTransitionStrip = {
  id: string;
  timeSeconds: number;
  relativePath: string;
};

export type FullVideoMotionPattern = {
  id: string;
  name: string;
  family:
    | "hook_headline"
    | "side_card"
    | "chapter_card"
    | "process_flow"
    | "comparison"
    | "data_formula"
    | "proof_frame"
    | "map_chart"
    | "grid_cards"
    | "keyword_emphasis"
    | "outro_cta"
    | "caption_system"
    | "other";
  observedWindows: Array<{fromSeconds: number; toSeconds: number}>;
  frequency: number;
  visualRole: string;
  description: string;
  transferableTraits: string[];
  recommendedComponentId: string;
  implementation: "existing_template" | "needs_new_component";
  priority: "high" | "medium" | "low";
};

export type FullVideoSemanticReview = {
  reviewedBy: "codex";
  reviewedAt: string;
  summary: string;
  styleTraits: string[];
  patterns: FullVideoMotionPattern[];
  prohibitedElements: string[];
};

export type FullVideoReferenceAnalysis = {
  schemaVersion: "full-video-reference-analysis/1";
  intakeId: string;
  sourceHash: string;
  status: "sampled" | "semantic_reviewed";
  metadata: {
    width: number;
    height: number;
    durationSeconds: number;
    fps?: number;
  };
  sampling: {
    intervalSeconds: number;
    sceneThreshold: number;
    contactSheetColumns: number;
    contactSheetRows: number;
  };
  contactSheets: FullVideoContactSheet[];
  transitionStrips: FullVideoTransitionStrip[];
  semanticReview?: FullVideoSemanticReview;
  createdAt: string;
  updatedAt: string;
};

export type RenderJob = {
  id: string;
  status:
    | "queued"
    | "preparing"
    | "rendering"
    | "verifying"
    | "awaiting_human_review"
    | "succeeded"
    | "failed"
    | "cancelled";
  projectSnapshotPath: string;
  projectSnapshotHash: string;
  templateRegistryVersion: string;
  styleProfileVersion: string;
  assetManifestHashes: string[];
  compositionId: "EditorComposition";
  inputPropsHash: string;
  inputPropsPath: string;
  outputPath?: string;
  qaReportPath?: string;
  logPath: string;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  watchReview?: {
    status: "passed" | "failed";
    reviewedAt: string;
    reviewedBy: "ajiu";
    notes?: string;
  };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type ValidationResult =
  | {ok: true; issues: []}
  | {ok: false; issues: ValidationIssue[]};
