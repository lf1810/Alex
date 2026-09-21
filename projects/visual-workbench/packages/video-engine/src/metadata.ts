import type {EditorInputProps, CompositionMetadata} from "./types.js";

const numberToken = (value: string | number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const resolveCompositionMetadata = (inputProps: EditorInputProps): CompositionMetadata => {
  const {settings} = inputProps.project;
  const geometry = inputProps.styleProfile.tokens.geometry;
  return {
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    durationInFrames: settings.durationInFrames,
    orientation: settings.orientation,
    safeArea: {
      left: numberToken(geometry.safeLeft, 96),
      right: numberToken(geometry.safeRight, 96),
      top: numberToken(geometry.safeTop, 80),
      bottom: numberToken(geometry.safeBottom, 140),
    },
    suggestedCodec: "h264",
  };
};

export const canonicalizeEditorInputProps = (inputProps: EditorInputProps): EditorInputProps => ({
  project: structuredClone(inputProps.project),
  styleProfile: structuredClone(inputProps.styleProfile),
  templateRegistry: structuredClone(inputProps.templateRegistry),
  assetMap: Object.fromEntries(Object.entries(inputProps.assetMap).sort(([a], [b]) => a.localeCompare(b))),
});
