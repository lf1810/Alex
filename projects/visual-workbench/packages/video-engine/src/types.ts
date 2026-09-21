import type {ProjectDocument, StyleProfile, TemplateDefinition} from "@ajiunotes/contracts";

export type AssetMap = Record<string, string>;

export type EditorInputProps = {
  project: ProjectDocument;
  styleProfile: StyleProfile;
  templateRegistry: TemplateDefinition[];
  assetMap: AssetMap;
};

export type CompositionMetadata = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  orientation: "horizontal" | "vertical";
  safeArea: {left: number; right: number; top: number; bottom: number};
  suggestedCodec: "h264";
};

export type AssetIntegrity = {
  assetId: string;
  sourcePath: string;
  resolvedPath?: string;
  status: "ready" | "missing" | "blocked";
  reason?: string;
};
