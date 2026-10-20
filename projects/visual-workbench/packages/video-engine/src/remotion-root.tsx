import {Composition, registerRoot} from "remotion";
import {EditorComposition} from "./EditorComposition.js";
import {resolveCompositionMetadata} from "./metadata.js";
import type {EditorInputProps} from "./types.js";
import {TEMPLATE_REGISTRY_VERSION} from "@ajiunotes/template-registry";

const emptyProps: EditorInputProps = {
  project: {
    schemaVersion: "project-document/1",
    projectId: "empty",
    name: "Empty",
    status: "candidate_not_approved",
    settings: {width: 1920, height: 1080, fps: 30, durationInFrames: 1, orientation: "horizontal"},
    assets: [],
    tracks: [{id: "empty", type: "annotation", name: "Empty", order: 0, enabled: true, locked: true}],
    clips: [],
    templateRegistryVersion: TEMPLATE_REGISTRY_VERSION,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  styleProfile: {
    id: "empty",
    version: "0",
    status: "provisional",
    referenceIds: [],
    tokens: {colors: {}, typography: {}, geometry: {}, effects: {}},
    motion: {allowedPresets: ["opacity-only"], defaultEnterFrames: 1, defaultExitFrames: 1, reducedMotionFallback: "opacity-only"},
    layoutRules: [],
    prohibitedImitation: ["none"],
  },
  templateRegistry: [],
  assetMap: {},
};

const RemotionRoot = () => (
  <Composition
    id="EditorComposition"
    component={EditorComposition}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={emptyProps}
    calculateMetadata={({props}) => {
      const metadata = resolveCompositionMetadata(props);
      return {
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        durationInFrames: metadata.durationInFrames,
        props,
      };
    }}
  />
);

registerRoot(RemotionRoot);
