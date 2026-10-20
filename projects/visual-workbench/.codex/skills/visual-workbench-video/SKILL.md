---
name: visual-workbench-video
description: 为本仓库的 Remotion 可视化编导台分析口播视频、生成带时间戳的初剪方案、在用户明确确认后创建可编辑 ProjectDocument，并按项目名称或 ID 本地导出视频。用户说“分析这条视频生成初剪方案”“确认并导入编导台”“直接导入视频”“导出某个项目”时使用。
---

# 可视化编导台视频流程

## 核心合同

- 原始视频只读。不得裁掉、覆盖或重新编码 `input/videos/` 内的文件。
- 先生成方案，后写项目。没有用户明确确认，不得运行 `apply-rough-cut-plan.mjs`。
- 初剪方案必须逐段写出来源文件、源入点、源出点、成片时间、保留理由。
- 不擅自加入动效、字幕或 B-roll。初剪只负责口播结构和气口，后续由用户在编导台完成。
- 编导台预览可使用代理，正式导出必须读取原始素材。
- 导出会因叠加动效而重新编码；保持项目原分辨率和帧率，并使用高质量参数，不能声称“绝对无损”。

## 判断用户意图

### 分析并生成初剪

当用户说“分析这条视频生成初剪方案”：

1. 完整读取 [workflow.md](references/workflow.md)。
2. 检查 `input/videos/`，运行：

   `node .codex/skills/visual-workbench-video/scripts/inspect-media.mjs`

3. 如有 UTF-8 SRT，优先使用 `input/subtitles/` 中同名文件。没有字幕时，使用当前 Codex 可用的转写能力；若环境没有转写能力，明确要求用户补充 SRT，不猜口播内容。
4. 结合转写、波形停顿和实际画面，生成：
   - `workbench-output/plans/<项目ID>/rough-cut-plan.md`
   - `workbench-output/plans/<项目ID>/rough-cut-plan.json`
5. JSON 必须符合 [rough-cut-plan.schema.json](references/rough-cut-plan.schema.json)，初次状态必须为 `proposed`。
6. 把方案完整展示给用户并停止。明确询问是否确认，不能自动导入。

### 确认并导入编导台

只有用户明确说“确认”“按这个方案导入”后：

1. 将方案 `status` 改为 `confirmed`。
2. 运行：

   `node .codex/skills/visual-workbench-video/scripts/apply-rough-cut-plan.mjs <方案JSON>`

3. 报告项目 ID、项目文件路径和启动方法。
4. 运行 `pnpm dev` 或打开桌面版后，项目会出现在首页。

### 完全手动

用户不需要 Codex 初剪时，告诉他打开首页，点击“直接导入视频新建项目”，多选视频后即可进入时间线手动剪辑。

### 导出项目

用户说“导出 xx 项目的视频”时：

1. 先保存当前项目；如果桌面端尚未写盘，提示用户在编导台点击一次“保存”。
2. 运行（项目名称和项目 ID 均可）：

   `pnpm render:project -- "<项目名称或项目ID>"`

3. 如果名称不唯一，命令会列出候选项目 ID；此时必须请用户选择，不能猜。
4. 等待命令结束，使用 ffprobe 核对输出分辨率、帧率、时长和音轨。
5. 报告 `exports/` 下的绝对文件路径。机器检查不能冒充用户已完整观看。

## 异常处理

- 多个文件或项目同名：列出候选，不替用户猜。
- 方案超出源视频时长：停止，不写项目。
- 缺少 ffmpeg/ffprobe：给出安装提示，不伪造结果。
- 用户修改初剪方案后：重新校验整个 JSON，再创建项目。
