export type DirectorFormat = {
  width: number;
  height: number;
  fps: number;
  duration?: number;
  durationInFrames?: number;
};

export type DirectorTransform = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  rotation?: number;
  z?: number;
};

export type DirectorTimedItem = {
  id: string;
  from?: number;
  durationInFrames?: number;
  start?: number;
  end?: number;
};

export type DirectorSegment = DirectorTimedItem & {
  title?: string;
  shot_label?: string;
  role?: string;
  narration?: string;
  caption?: string;
  visual_intent?: string;
  effects?: string[];
};

export type DirectorEffect = DirectorTimedItem & {
  type: string;
  props?: Record<string, unknown>;
  text?: string;
  title?: string;
  label?: string;
  position?: string;
  asset?: string;
  src?: string;
  transform?: DirectorTransform;
  style?: Record<string, unknown>;
  animation?: string | Record<string, unknown>;
  priority?: number;
  mandatory?: boolean;
  reason?: string;
  purpose?: string;
  fallback?: string;
  occlusion_risk?: string;
  [key: string]: unknown;
};

export type DirectorPlan = {
  project_name: string;
  status: string;
  schema_version?: string;
  format: DirectorFormat;
  source: {
    raw_video: string;
    transcript_file?: string;
    subtitle_file?: string;
    assets_dir?: string;
  };
  style?: Record<string, unknown>;
  segments?: DirectorSegment[];
  effects?: DirectorEffect[];
  render_notes?: string[];
};

export type AdapterOptions = {
  directorPlanPath?: string;
  directorPlanHash?: string;
  timestamp?: string;
  transformUnit?: "auto" | "normalized" | "pixels";
};
