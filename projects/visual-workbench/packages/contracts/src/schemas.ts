const nonEmptyString = {type: "string", minLength: 1} as const;
const nonNegativeInteger = {type: "integer", minimum: 0} as const;
const positiveInteger = {type: "integer", minimum: 1} as const;

const transformSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "width", "height", "scale", "rotation", "opacity", "zIndex"],
  properties: {
    x: {type: "number"},
    y: {type: "number"},
    width: {type: "number", exclusiveMinimum: 0},
    height: {type: "number", exclusiveMinimum: 0},
    scale: {type: "number", exclusiveMinimum: 0},
    rotation: {type: "number"},
    opacity: {type: "number", minimum: 0, maximum: 1},
    zIndex: {type: "integer"},
  },
} as const;

const licenseStatusSchema = {
  enum: [
    "owned_or_created",
    "licensed",
    "user_confirmed",
    "reference_only",
    "unknown",
    "restricted",
  ],
} as const;

export const projectDocumentSchema = {
  $id: "https://ajiunotes.local/schemas/project-document-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "projectId",
    "name",
    "status",
    "settings",
    "assets",
    "tracks",
    "clips",
    "templateRegistryVersion",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    schemaVersion: {const: "project-document/1"},
    projectId: nonEmptyString,
    name: nonEmptyString,
    status: {enum: ["candidate_not_approved", "approved_for_render"]},
    settings: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height", "fps", "durationInFrames", "orientation"],
      properties: {
        width: positiveInteger,
        height: positiveInteger,
        fps: positiveInteger,
        durationInFrames: positiveInteger,
        orientation: {enum: ["horizontal", "vertical"]},
      },
    },
    assets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "sourcePath",
          "sourceKind",
          "licenseStatus",
          "ingestStatus",
        ],
        properties: {
          id: nonEmptyString,
          type: {enum: ["video", "image", "audio", "subtitle", "font", "document"]},
          sourcePath: nonEmptyString,
          sourceKind: {enum: ["owned", "licensed-pack", "user-upload", "reference-derived"]},
          licenseStatus: licenseStatusSchema,
          ingestStatus: {enum: ["candidate", "approved", "quarantined", "rejected"]},
          mimeType: nonEmptyString,
          contentHash: nonEmptyString,
          durationInFrames: positiveInteger,
          width: positiveInteger,
          height: positiveInteger,
          derived: {
            type: "object",
            additionalProperties: false,
            properties: {
              proxyPath: nonEmptyString,
              thumbnailPath: nonEmptyString,
            },
          },
        },
      },
    },
    tracks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "name", "order", "enabled", "locked"],
        properties: {
          id: nonEmptyString,
          type: {enum: ["video", "overlay", "caption", "audio", "annotation"]},
          name: nonEmptyString,
          order: nonNegativeInteger,
          enabled: {type: "boolean"},
          locked: {type: "boolean"},
          muted: {type: "boolean"},
        },
      },
    },
    clips: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "trackId",
          "from",
          "durationInFrames",
          "sourceInFrames",
          "props",
          "transform",
          "enabled",
        ],
        properties: {
          id: nonEmptyString,
          type: {enum: ["video", "image", "audio", "caption", "template"]},
          trackId: nonEmptyString,
          from: nonNegativeInteger,
          durationInFrames: positiveInteger,
          sourceInFrames: nonNegativeInteger,
          assetId: nonEmptyString,
          componentId: nonEmptyString,
          templateVersion: nonEmptyString,
          props: {type: "object"},
          transform: transformSchema,
          enabled: {type: "boolean"},
          origin: {
            type: "object",
            additionalProperties: false,
            required: ["kind"],
            properties: {
              kind: {enum: ["director", "manual", "motion-spec", "import"]},
              sourceId: nonEmptyString,
            },
          },
        },
      },
    },
    shotNodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "from", "durationInFrames"],
        properties: {
          id: nonEmptyString,
          label: nonEmptyString,
          from: nonNegativeInteger,
          durationInFrames: positiveInteger,
          sourceId: nonEmptyString,
          visualIntent: nonEmptyString,
        },
      },
    },
    directorPlanRef: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: nonEmptyString,
        hash: nonEmptyString,
        version: nonEmptyString,
      },
    },
    styleProfileRef: {
      type: "object",
      additionalProperties: false,
      required: ["id", "version"],
      properties: {id: nonEmptyString, version: nonEmptyString},
    },
    templateRegistryVersion: nonEmptyString,
    approval: {
      type: "object",
      additionalProperties: false,
      required: ["digest", "approvedAt", "approvedBy"],
      properties: {
        digest: nonEmptyString,
        approvedAt: {type: "string", format: "date-time"},
        approvedBy: {const: "ajiu"},
      },
    },
    createdAt: {type: "string", format: "date-time"},
    updatedAt: {type: "string", format: "date-time"},
  },
} as const;

export const styleProfileSchema = {
  $id: "https://ajiunotes.local/schemas/style-profile-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["id", "version", "status", "referenceIds", "tokens", "motion", "layoutRules", "prohibitedImitation"],
  properties: {
    id: nonEmptyString,
    version: nonEmptyString,
    status: {enum: ["provisional", "approved", "inactive_not_deleted"]},
    referenceIds: {type: "array", items: nonEmptyString},
    tokens: {
      type: "object",
      additionalProperties: false,
      required: ["colors", "typography", "geometry", "effects"],
      properties: {
        colors: {type: "object", additionalProperties: {type: "string"}},
        typography: {type: "object", additionalProperties: {type: ["string", "number"]}},
        geometry: {type: "object", additionalProperties: {type: ["string", "number"]}},
        effects: {type: "object", additionalProperties: {type: ["string", "number"]}},
      },
    },
    motion: {
      type: "object",
      additionalProperties: false,
      required: ["allowedPresets", "defaultEnterFrames", "defaultExitFrames", "reducedMotionFallback"],
      properties: {
        allowedPresets: {type: "array", minItems: 1, items: nonEmptyString},
        defaultEnterFrames: positiveInteger,
        defaultExitFrames: positiveInteger,
        reducedMotionFallback: nonEmptyString,
      },
    },
    layoutRules: {type: "array", items: nonEmptyString},
    prohibitedImitation: {type: "array", minItems: 1, items: nonEmptyString},
  },
} as const;

export const templateDefinitionSchema = {
  $id: "https://ajiunotes.local/schemas/template-definition-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["componentId", "version", "propsSchemaId", "defaultProps", "allowedOutputs", "deterministic"],
  properties: {
    componentId: nonEmptyString,
    version: nonEmptyString,
    propsSchemaId: nonEmptyString,
    defaultProps: {type: "object"},
    allowedOutputs: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {enum: ["composition", "mp4", "webm-alpha"]},
    },
    deterministic: {const: true},
  },
} as const;

export const motionSpecSchema = {
  $id: "https://ajiunotes.local/schemas/motion-spec-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["id", "status", "componentId", "templateVersion", "from", "durationInFrames", "props", "transform", "purpose"],
  properties: {
    id: nonEmptyString,
    status: {const: "candidate"},
    componentId: nonEmptyString,
    templateVersion: nonEmptyString,
    from: nonNegativeInteger,
    durationInFrames: positiveInteger,
    props: {type: "object"},
    transform: transformSchema,
    purpose: nonEmptyString,
    fallback: nonEmptyString,
  },
} as const;

export const motionPresetSchema = {
  $id: "https://ajiunotes.local/schemas/motion-preset-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "name", "status", "componentId", "templateVersion", "props", "defaultTransform", "sourceProjectId", "createdAt"],
  properties: {
    schemaVersion: {const: "motion-preset/1"},
    id: nonEmptyString,
    name: nonEmptyString,
    status: {const: "approved"},
    componentId: nonEmptyString,
    templateVersion: nonEmptyString,
    props: {type: "object"},
    defaultTransform: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height", "scale", "rotation", "opacity"],
      properties: {
        x: {type: "number"}, y: {type: "number"}, width: {type: "number", exclusiveMinimum: 0}, height: {type: "number", exclusiveMinimum: 0},
        scale: {type: "number", exclusiveMinimum: 0}, rotation: {type: "number"}, opacity: {type: "number", minimum: 0, maximum: 1},
      },
    },
    sourceProjectId: nonEmptyString,
    sourceReferenceId: nonEmptyString,
    sourceReferenceHash: nonEmptyString,
    promotionApproval: {
      type: "object",
      additionalProperties: false,
      required: ["approvedBy", "approvedAt", "confirmation"],
      properties: {
        approvedBy: {const: "ajiu"},
        approvedAt: {type: "string", format: "date-time"},
        confirmation: {const: "reference_rebuild_explicit_confirmation"},
      },
    },
    createdAt: {type: "string", format: "date-time"},
  },
} as const;

export const assetImportRecordSchema = {
  $id: "https://ajiunotes.local/schemas/asset-import-record-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["id", "originalPath", "contentHash", "detectedType", "executableRisk", "licenseStatus", "disposition", "derivedFiles", "notes"],
  properties: {
    id: nonEmptyString,
    originalPath: nonEmptyString,
    contentHash: nonEmptyString,
    detectedType: nonEmptyString,
    archiveEntries: nonNegativeInteger,
    executableRisk: {enum: ["none", "review", "blocked"]},
    licenseStatus: licenseStatusSchema,
    disposition: {enum: ["asset_candidate", "style_reference", "template_rebuild", "quarantine", "reject"]},
    derivedFiles: {type: "array", items: nonEmptyString},
    notes: {type: "array", items: {type: "string"}},
  },
} as const;

export const styleReferenceAnalysisSchema = {
  $id: "https://ajiunotes.local/schemas/style-reference-analysis-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "intakeId", "sourceHash", "sourceKind", "status", "metadata", "previewFrames", "suggestedComponentId", "createdAt", "updatedAt"],
  properties: {
    schemaVersion: {const: "style-reference-analysis/1"},
    intakeId: nonEmptyString,
    sourceHash: nonEmptyString,
    sourceKind: {enum: ["image", "video"]},
    status: {enum: ["ready_for_review", "candidate_created", "promoted"]},
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height", "durationSeconds"],
      properties: {
        width: positiveInteger,
        height: positiveInteger,
        durationSeconds: {type: "number", minimum: 0},
        fps: {type: "number", exclusiveMinimum: 0},
      },
    },
    previewFrames: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "timeSeconds", "relativePath", "width", "height"],
        properties: {
          id: nonEmptyString,
          timeSeconds: {type: "number", minimum: 0},
          relativePath: nonEmptyString,
          width: positiveInteger,
          height: positiveInteger,
        },
      },
    },
    proxyPath: nonEmptyString,
    suggestedComponentId: nonEmptyString,
    createdAt: {type: "string", format: "date-time"},
    updatedAt: {type: "string", format: "date-time"},
  },
} as const;

export const referenceRebuildCandidateSchema = {
  $id: "https://ajiunotes.local/schemas/reference-rebuild-candidate-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "intakeId", "sourceHash", "sourceProjectId", "status", "name", "componentId", "templateVersion", "props", "defaultTransform", "durationInFrames", "purpose", "transferableTraits", "prohibitedElements", "createdAt", "updatedAt"],
  properties: {
    schemaVersion: {const: "reference-rebuild-candidate/1"},
    id: nonEmptyString,
    intakeId: nonEmptyString,
    sourceHash: nonEmptyString,
    sourceProjectId: nonEmptyString,
    status: {enum: ["candidate", "promoted", "rejected"]},
    name: nonEmptyString,
    componentId: nonEmptyString,
    templateVersion: nonEmptyString,
    props: {type: "object"},
    defaultTransform: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height", "scale", "rotation", "opacity"],
      properties: {
        x: {type: "number"}, y: {type: "number"}, width: {type: "number", exclusiveMinimum: 0}, height: {type: "number", exclusiveMinimum: 0},
        scale: {type: "number", exclusiveMinimum: 0}, rotation: {type: "number"}, opacity: {type: "number", minimum: 0, maximum: 1},
      },
    },
    durationInFrames: positiveInteger,
    selectedFrameId: nonEmptyString,
    purpose: nonEmptyString,
    transferableTraits: {type: "array", minItems: 1, items: nonEmptyString},
    prohibitedElements: {type: "array", minItems: 1, items: nonEmptyString},
    createdAt: {type: "string", format: "date-time"},
    updatedAt: {type: "string", format: "date-time"},
    promotedPresetId: nonEmptyString,
  },
} as const;

const fullVideoWindowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fromSeconds", "toSeconds"],
  properties: {
    fromSeconds: {type: "number", minimum: 0},
    toSeconds: {type: "number", minimum: 0},
  },
} as const;

const fullVideoPatternSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "family", "observedWindows", "frequency", "visualRole", "description", "transferableTraits", "recommendedComponentId", "implementation", "priority"],
  properties: {
    id: nonEmptyString,
    name: nonEmptyString,
    family: {enum: ["hook_headline", "side_card", "chapter_card", "process_flow", "comparison", "data_formula", "proof_frame", "map_chart", "grid_cards", "keyword_emphasis", "outro_cta", "caption_system", "other"]},
    observedWindows: {type: "array", minItems: 1, items: fullVideoWindowSchema},
    frequency: positiveInteger,
    visualRole: nonEmptyString,
    description: nonEmptyString,
    transferableTraits: {type: "array", minItems: 1, items: nonEmptyString},
    recommendedComponentId: nonEmptyString,
    implementation: {enum: ["existing_template", "needs_new_component"]},
    priority: {enum: ["high", "medium", "low"]},
  },
} as const;

export const fullVideoReferenceAnalysisSchema = {
  $id: "https://ajiunotes.local/schemas/full-video-reference-analysis-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "intakeId", "sourceHash", "status", "metadata", "sampling", "contactSheets", "transitionStrips", "createdAt", "updatedAt"],
  properties: {
    schemaVersion: {const: "full-video-reference-analysis/1"},
    intakeId: nonEmptyString,
    sourceHash: nonEmptyString,
    status: {enum: ["sampled", "semantic_reviewed"]},
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height", "durationSeconds"],
      properties: {
        width: positiveInteger,
        height: positiveInteger,
        durationSeconds: {type: "number", exclusiveMinimum: 0},
        fps: {type: "number", exclusiveMinimum: 0},
      },
    },
    sampling: {
      type: "object",
      additionalProperties: false,
      required: ["intervalSeconds", "sceneThreshold", "contactSheetColumns", "contactSheetRows"],
      properties: {
        intervalSeconds: {type: "number", exclusiveMinimum: 0},
        sceneThreshold: {type: "number", exclusiveMinimum: 0, maximum: 1},
        contactSheetColumns: positiveInteger,
        contactSheetRows: positiveInteger,
      },
    },
    contactSheets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "fromSeconds", "toSeconds", "relativePath", "frameIntervalSeconds", "columns", "rows", "frameCount"],
        properties: {
          id: nonEmptyString,
          fromSeconds: {type: "number", minimum: 0},
          toSeconds: {type: "number", minimum: 0},
          relativePath: nonEmptyString,
          frameIntervalSeconds: {type: "number", exclusiveMinimum: 0},
          columns: positiveInteger,
          rows: positiveInteger,
          frameCount: positiveInteger,
        },
      },
    },
    transitionStrips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "timeSeconds", "relativePath"],
        properties: {id: nonEmptyString, timeSeconds: {type: "number", minimum: 0}, relativePath: nonEmptyString},
      },
    },
    semanticReview: {
      type: "object",
      additionalProperties: false,
      required: ["reviewedBy", "reviewedAt", "summary", "styleTraits", "patterns", "prohibitedElements"],
      properties: {
        reviewedBy: {const: "codex"},
        reviewedAt: {type: "string", format: "date-time"},
        summary: nonEmptyString,
        styleTraits: {type: "array", minItems: 1, items: nonEmptyString},
        patterns: {type: "array", minItems: 1, items: fullVideoPatternSchema},
        prohibitedElements: {type: "array", minItems: 1, items: nonEmptyString},
      },
    },
    createdAt: {type: "string", format: "date-time"},
    updatedAt: {type: "string", format: "date-time"},
  },
} as const;

export const projectApprovalManifestSchema = {
  $id: "https://ajiunotes.local/schemas/project-approval-manifest-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "projectId", "approvalDigest", "snapshotPath", "snapshotHash", "preflightResultPath", "preflightResultHash", "preflightRiskTier", "performancePreflightPath", "performancePreflightHash", "approvedAt", "approvedBy", "confirmation"],
  properties: {
    schemaVersion: {const: "project-approval-manifest/1"},
    projectId: nonEmptyString,
    approvalDigest: nonEmptyString,
    snapshotPath: nonEmptyString,
    snapshotHash: nonEmptyString,
    preflightResultPath: nonEmptyString,
    preflightResultHash: nonEmptyString,
    preflightRiskTier: {enum: ["低风险", "中风险", "高风险"]},
    performancePreflightPath: nonEmptyString,
    performancePreflightHash: nonEmptyString,
    approvedAt: {type: "string", format: "date-time"},
    approvedBy: {const: "ajiu"},
    confirmation: {const: "explicit_ui_confirmation"},
  },
} as const;

const performanceScoreSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "reason"],
  properties: {score: {type: "number", minimum: 0, maximum: 5}, reason: nonEmptyString},
} as const;

export const performancePreflightRecordSchema = {
  $id: "https://ajiunotes.local/schemas/performance-preflight-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "projectId", "projectUpdatedAt", "projectDigest", "source", "riskTier", "strongestSection", "weakestSection", "scores", "relativeExpectation", "fixes", "decision", "decisionConfirmedBy", "createdAt"],
  properties: {
    schemaVersion: {const: "ajiunotes-performance-preflight/1"},
    projectId: nonEmptyString,
    projectUpdatedAt: {type: "string", format: "date-time"},
    projectDigest: nonEmptyString,
    source: {const: "ajiunotes-performance-calibrator"},
    riskTier: {enum: ["high", "medium", "low"]},
    strongestSection: nonEmptyString,
    weakestSection: nonEmptyString,
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["audience_relevance", "hook_clarity", "evidence_strength", "information_progression", "demo_readability", "save_reuse_value", "follow_series_reason", "trust_voice", "packaging_match"],
      properties: {
        audience_relevance: performanceScoreSchema,
        hook_clarity: performanceScoreSchema,
        evidence_strength: performanceScoreSchema,
        information_progression: performanceScoreSchema,
        demo_readability: performanceScoreSchema,
        save_reuse_value: performanceScoreSchema,
        follow_series_reason: performanceScoreSchema,
        trust_voice: performanceScoreSchema,
        packaging_match: performanceScoreSchema,
      },
    },
    relativeExpectation: nonEmptyString,
    fixes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "frame", "title", "expectedImprovement"],
        properties: {priority: positiveInteger, frame: nonNegativeInteger, clipId: nonEmptyString, title: nonEmptyString, expectedImprovement: nonEmptyString},
      },
    },
    decision: {enum: ["revise", "proceed"]},
    decisionConfirmedBy: {const: "ajiu"},
    createdAt: {type: "string", format: "date-time"},
  },
} as const;

export const renderJobSchema = {
  $id: "https://ajiunotes.local/schemas/render-job-v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["id", "status", "projectSnapshotPath", "projectSnapshotHash", "templateRegistryVersion", "styleProfileVersion", "assetManifestHashes", "compositionId", "inputPropsHash", "inputPropsPath", "logPath", "createdAt"],
  properties: {
    id: nonEmptyString,
    status: {enum: ["queued", "preparing", "rendering", "verifying", "awaiting_human_review", "succeeded", "failed", "cancelled"]},
    projectSnapshotPath: nonEmptyString,
    projectSnapshotHash: nonEmptyString,
    templateRegistryVersion: nonEmptyString,
    styleProfileVersion: nonEmptyString,
    assetManifestHashes: {type: "array", items: nonEmptyString},
    compositionId: {const: "EditorComposition"},
    inputPropsHash: nonEmptyString,
    inputPropsPath: nonEmptyString,
    outputPath: nonEmptyString,
    qaReportPath: nonEmptyString,
    logPath: nonEmptyString,
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "recoverable"],
      properties: {
        code: nonEmptyString,
        message: nonEmptyString,
        recoverable: {type: "boolean"},
      },
    },
    watchReview: {
      type: "object",
      additionalProperties: false,
      required: ["status", "reviewedAt", "reviewedBy"],
      properties: {
        status: {enum: ["passed", "failed"]},
        reviewedAt: {type: "string", format: "date-time"},
        reviewedBy: {const: "ajiu"},
        notes: {type: "string"},
      },
    },
    createdAt: {type: "string", format: "date-time"},
    startedAt: {type: "string", format: "date-time"},
    finishedAt: {type: "string", format: "date-time"},
  },
  allOf: [
    {
      if: {properties: {status: {const: "awaiting_human_review"}}, required: ["status"]},
      then: {required: ["outputPath", "qaReportPath", "startedAt"]},
    },
    {
      if: {properties: {status: {const: "succeeded"}}, required: ["status"]},
      then: {
        required: ["outputPath", "qaReportPath", "watchReview", "startedAt", "finishedAt"],
        properties: {watchReview: {properties: {status: {const: "passed"}}, required: ["status"]}},
      },
    },
  ],
} as const;
