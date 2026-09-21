export const CARD_SFX_PRESETS = [
  {id: "auto", label: "自动轮换（推荐）"},
  {id: "none", label: "无音效"},
  {id: "soft-click", label: "轻触科技", path: ".media/audio/sfx/sfx_001.mp3", gain: 0.9},
  {id: "data-pop", label: "数据弹出", path: ".media/audio/sfx/sfx_002.mp3", gain: 0.55},
  {id: "glass-ping", label: "玻璃提示", path: ".media/audio/sfx/sfx_003.mp3", gain: 0.38},
  {id: "tech-swish", label: "科技掠过", path: ".media/audio/sfx/sfx_004.mp3", gain: 0.45},
] as const;

export type CardSfxPresetId = typeof CARD_SFX_PRESETS[number]["id"];
export type ResolvedCardSfxPresetId = Exclude<CardSfxPresetId, "auto" | "none">;

const resolvedPresetIds: readonly ResolvedCardSfxPresetId[] = [
  "soft-click",
  "data-pop",
  "glass-ping",
  "tech-swish",
];

const cardSfxSuffixes = [
  "result-card",
  "side-card",
  "chapter-card",
  "comparison-card",
  "risk-card",
  "verdict-card",
  "process-flow",
  "module-grid",
  "data-formula",
  "growth-curve",
  "zero-timeline",
  "favorite-confirm",
  "folder-multiply",
  "themed-card",
  "data-table",
  "progressive-points",
  "saas-network",
  "section-lockup",
  "logo-title",
  "hero-focus",
  "focus-stack",
  "profile-proof",
  "case-gallery",
] as const;

export const supportsCardSfx = (componentId: string | undefined): boolean =>
  Boolean(componentId && cardSfxSuffixes.some((suffix) => componentId.endsWith(suffix)));

export const isCardSfxPresetId = (source: unknown): source is CardSfxPresetId =>
  typeof source === "string" && CARD_SFX_PRESETS.some((preset) => preset.id === source);

export const resolveCardSfxPresetId = (
  clipId: string,
  source: unknown,
): ResolvedCardSfxPresetId | "none" => {
  const selected = isCardSfxPresetId(source) ? source : "auto";
  if (selected === "none") return "none";
  if (selected !== "auto") return selected;
  let hash = 2166136261;
  for (const character of clipId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return resolvedPresetIds[Math.abs(hash) % resolvedPresetIds.length]!;
};

export const getCardSfxPreset = (id: ResolvedCardSfxPresetId) =>
  CARD_SFX_PRESETS.find((preset) => preset.id === id) as Extract<typeof CARD_SFX_PRESETS[number], {id: ResolvedCardSfxPresetId}>;
