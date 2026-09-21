import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {clearMotionClips} from "../packages/editor-core/dist/index.js";
import {templateRegistry, trustedTemplateIds} from "../packages/template-registry/dist/index.js";

const baseProject = {
  schemaVersion: "project-document/1",
  projectId: "community-test",
  name: "Community Test",
  status: "candidate_not_approved",
  settings: {width: 1280, height: 720, fps: 30, durationInFrames: 90, orientation: "horizontal"},
  assets: [],
  tracks: [
    {id: "track-video", type: "video", name: "视频", order: 10, enabled: true, locked: false},
    {id: "track-overlay", type: "overlay", name: "动效", order: 20, enabled: true, locked: false},
  ],
  clips: [
    {
      id: "video-1",
      type: "video",
      trackId: "track-video",
      from: 0,
      durationInFrames: 90,
      sourceInFrames: 0,
      props: {},
      transform: {x: 0, y: 0, width: 1280, height: 720, scale: 1, rotation: 0, opacity: 1, zIndex: 0},
      enabled: true,
    },
    {
      id: "motion-1",
      type: "template",
      trackId: "track-overlay",
      from: 10,
      durationInFrames: 30,
      sourceInFrames: 0,
      componentId: "ajiunotes.typography.section-lockup",
      templateVersion: "0.1.0",
      props: {},
      transform: {x: 40, y: 40, width: 600, height: 220, scale: 1, rotation: 0, opacity: 1, zIndex: 20},
      enabled: true,
    },
  ],
  styleProfileRef: {id: "ajiunotes-tech-console-v1", version: "0.1.0"},
  templateRegistryVersion: "ajiunotes-tech-registry/0.6.0",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("一键清除动效只移除模板，不修改原视频", () => {
  const result = clearMotionClips(baseProject);
  assert.deepEqual(result.clips.map((clip) => clip.id), ["video-1"]);
  assert.equal(result.clips[0].durationInFrames, 90);
});

test("公开模板注册表不包含已排除的叙事模板", () => {
  assert.ok(templateRegistry.length > 0);
  assert.ok(trustedTemplateIds.has("ajiunotes.typography.section-lockup"));
  assert.equal([...trustedTemplateIds].some((id) => id.includes("narrative")), false);
});

test("公开动效列表只合并备用动效和社区文字动效", async () => {
  const source = await readFile(new URL("../app/src/workbench-panels.tsx", import.meta.url), "utf8");
  assert.match(source, /preset\.name\.startsWith\("备用｜"\)/);
  assert.match(source, /createCommunityMotionPresets/);
  assert.match(source, /application\/x-ajiunotes-motion-preset-json/);
  assert.doesNotMatch(source, /Motion2LibraryPanel/);
});

test("拖拽动效优先携带完整预设并回退到同一内置目录", async () => {
  const source = await readFile(new URL("../app/src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /application\/x-ajiunotes-motion-preset-json/);
  assert.match(source, /createCommunityMotionPresets\(editor\.project\)/);
});

test("公开版恰好提供八个社区动效", async () => {
  const source = await readFile(new URL("../app/src/community-motion-presets.ts", import.meta.url), "utf8");
  const presetIds = [...source.matchAll(/id: "builtin-typography-[^"]+"/g)];
  assert.equal(presetIds.length, 8);
});
