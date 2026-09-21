import type {AssetImportRecord, LicenseStatus, StyleProfile} from "@ajiunotes/contracts";

export const AJIUNOTES_TECH_CONSOLE_V1: StyleProfile = {
  id: "ajiunotes-tech-console-v1",
  version: "0.1.0",
  status: "provisional",
  referenceIds: ["benchmark:ai-creator-20", "benchmark:zhuzige-tech-information-grammar"],
  tokens: {
    colors: {
      canvas: "#070A0F",
      panel: "rgba(13, 21, 31, 0.88)",
      panelStrong: "#101923",
      textPrimary: "#F5F8FC",
      textSecondary: "#A9B7C6",
      statusCyan: "#38D9FF",
      statusBlue: "#4C7DFF",
      resultGold: "#E6B85C",
      riskRed: "#FF646A",
      border: "rgba(93, 210, 255, 0.36)",
    },
    typography: {
      language: "zh-CN-first",
      headingWeight: 800,
      bodyWeight: 550,
      numberScale: 1.35,
      maxCaptionLines: 2,
    },
    geometry: {
      cornerRadius: 18,
      borderWidth: 1,
      safeLeft: 96,
      safeRight: 96,
      safeTop: 80,
      safeBottom: 140,
    },
    effects: {
      glowBlur: 20,
      glowOpacity: 0.28,
      panelShadow: "0 18px 54px rgba(0,0,0,0.38)",
      backdropBlur: 14,
    },
  },
  motion: {
    allowedPresets: [
      "tech-slide-right",
      "tech-slide-up",
      "tech-slide-scale",
      "spring-scale-in",
      "focus-expand",
      "split-reveal",
      "caption-fade",
      "warning-pulse-in",
    ],
    defaultEnterFrames: 9,
    defaultExitFrames: 6,
    reducedMotionFallback: "opacity-only",
  },
  layoutRules: [
    "one dominant visual subject per segment",
    "keep face, mouth, hands, captions, and proof mutually readable",
    "use a side card for judgments and a dominant proof frame for evidence",
    "use Chinese first; keep English only for real tool names and code fields",
    "use cyan-blue for status, gold for proven value, and restrained red for risk",
  ],
  prohibitedImitation: [
    "creator logo",
    "creator font combination",
    "creator column name",
    "creator cover layout",
    "creator signature gesture or slogan",
    "complete creator visual identity",
  ],
};

export const AJIUNOTES_INK_TECH_ARCHIVED: StyleProfile = {
  ...AJIUNOTES_TECH_CONSOLE_V1,
  id: "ajiunotes-ink-tech-legacy",
  version: "0.0.1",
  status: "inactive_not_deleted",
  referenceIds: ["legacy:remotion-demo"],
  layoutRules: ["historical profile only; do not select for new projects"],
};

export type ImportIntent = "direct-asset" | "style-reference";

export type ImportCandidateInput = {
  id: string;
  originalPath: string;
  contentHash: string;
  licenseStatus: LicenseStatus;
  intent?: ImportIntent;
  archiveEntries?: number;
};

const directMedia = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".mp4",
  ".mov",
  ".webm",
  ".gif",
  ".wav",
  ".mp3",
  ".m4a",
  ".srt",
  ".vtt",
  ".lottie.json",
]);
const projectFormats = new Set([".aep", ".aepx", ".mogrt", ".prproj", ".capcut", ".jianying"]);
const quarantineFormats = new Set([
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".html",
  ".css",
  ".sh",
  ".command",
  ".app",
  ".dmg",
  ".pkg",
  ".exe",
  ".plugin",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
]);

const extensionOf = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".lottie.json")) return ".lottie.json";
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
};

export const classifyImportCandidate = (input: ImportCandidateInput): AssetImportRecord => {
  const extension = extensionOf(input.originalPath);
  let executableRisk: AssetImportRecord["executableRisk"] = "none";
  let disposition: AssetImportRecord["disposition"] = "reject";
  const notes: string[] = [];

  if (directMedia.has(extension)) {
    disposition = input.intent === "style-reference" ? "style_reference" : "asset_candidate";
    if (extension === ".svg" || extension === ".lottie.json") {
      executableRisk = "review";
      notes.push("sanitize structured media and reject remote dependencies before approval");
    }
  } else if (projectFormats.has(extension)) {
    disposition = "template_rebuild";
    executableRisk = "review";
    notes.push("editor project is reference/rebuild only and cannot execute directly in Remotion");
  } else if (quarantineFormats.has(extension)) {
    disposition = "quarantine";
    executableRisk = [".zip", ".rar", ".7z", ".tar", ".gz"].includes(extension)
      ? "review"
      : "blocked";
    notes.push("keep isolated until source, license, and executable-content audit passes");
  } else {
    disposition = "reject";
    executableRisk = "review";
    notes.push("unsupported or unknown file type");
  }

  if (input.licenseStatus === "unknown" || input.licenseStatus === "restricted") {
    notes.push("license status blocks formal rendering");
  }
  if (input.intent === "style-reference") {
    notes.push("reference input must be rebuilt as AjIU-owned tokens or templates before formal use");
  }

  const base: AssetImportRecord = {
    id: input.id,
    originalPath: input.originalPath,
    contentHash: input.contentHash,
    detectedType: extension || "unknown",
    executableRisk,
    licenseStatus: input.licenseStatus,
    disposition,
    derivedFiles: [],
    notes,
  };

  return input.archiveEntries === undefined ? base : {...base, archiveEntries: input.archiveEntries};
};

export const styleProfiles: readonly StyleProfile[] = [
  AJIUNOTES_TECH_CONSOLE_V1,
  AJIUNOTES_INK_TECH_ARCHIVED,
];

export const getStyleProfile = (id: string, version: string): StyleProfile | undefined =>
  styleProfiles.find((profile) => profile.id === id && profile.version === version);
