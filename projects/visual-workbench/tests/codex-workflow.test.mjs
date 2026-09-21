import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("项目本地 Skill 强制先确认方案再写入编导台", async () => {
  const skill = await readFile(new URL("../.codex/skills/visual-workbench-video/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /没有用户明确确认，不得运行/);
  assert.match(skill, /rough-cut-plan\.json/);
  assert.match(skill, /pnpm render:project -- "<项目名称或项目ID>"/);
});

test("初剪写入脚本拒绝 proposed 状态", async () => {
  const source = await readFile(new URL("../.codex/skills/visual-workbench-video/scripts/apply-rough-cut-plan.mjs", import.meta.url), "utf8");
  assert.match(source, /plan\.status !== "confirmed"/);
  assert.match(source, /input\/videos/);
});

test("首页只提供一段或多段视频导入，不暴露项目 JSON 导入", async () => {
  const source = await readFile(new URL("../app/src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /导入一段或多段视频新建项目/);
  assert.match(source, /hidden multiple type="file"/);
  assert.match(source, /createProjectFromMedia/);
  assert.doesNotMatch(source, /导入项目备份/);
  assert.doesNotMatch(source, /importProject/);
});

test("项目中心提供 A9 自动命名、重命名和删除", async () => {
  const app = await readFile(new URL("../app/src/App.tsx", import.meta.url), "utf8");
  const store = await readFile(new URL("../local-service/src/project-store.ts", import.meta.url), "utf8");
  const server = await readFile(new URL("../local-service/src/server.ts", import.meta.url), "utf8");
  assert.match(app, /brand-mark">A9/);
  assert.match(app, /从镜头节点/);
  assert.match(app, /到剪辑动效/);
  assert.match(app, /在一张工作台推进/);
  assert.match(app, /重命名/);
  assert.match(app, /删除项目/);
  assert.match(app, /project-rename-form/);
  assert.doesNotMatch(app, /window\.prompt/);
  assert.match(store, /A9\\|项目/);
  assert.match(server, /deleteProject/);
  assert.match(server, /renameProject/);
});

test("桌面版能够在 Finder 启动环境中定位 Homebrew 的 ffmpeg 与 ffprobe", async () => {
  const desktop = await readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8");
  const mediaTools = await readFile(new URL("../local-service/src/media-tools.ts", import.meta.url), "utf8");
  assert.match(desktop, /\/opt\/homebrew\/bin/);
  assert.match(desktop, /\/usr\/local\/bin/);
  assert.match(desktop, /PATH: desktopPath/);
  assert.match(mediaTools, /VISUAL_WORKBENCH_FFMPEG/);
  assert.match(mediaTools, /VISUAL_WORKBENCH_FFPROBE/);
  assert.match(mediaTools, /brew install ffmpeg/);
});
