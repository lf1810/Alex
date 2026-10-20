# 影猫可视化编导台

<img width="3020" height="1538" alt="e44059cd7c80c421cf44d6631713fd4f" src="https://github.com/user-attachments/assets/d56f49de-9d07-4d56-abe7-1141f430997c" />

一个基于 Remotion 的本地多轨口播视频编导台。它既可以直接导入视频手动剪辑，也可以让 Codex 先分析录制素材、给出带时间戳的初剪方案，在你确认后创建可继续编辑的项目。

项目文件、素材和导出视频都保存在本机，不需要购买服务器。预览和正式渲染使用同一份 `ProjectDocument`、同一套 Remotion Composition 和同一组动效组件。

在编导台里手动剪辑、调整动效和保存项目都完全在本机执行，不调用大模型。只有主动让 Codex 分析素材、生成方案或代为执行导出命令时，才会使用用户自己的 Codex 会话额度。

## 两种使用方式

### 让 Codex 下载并初始化

仓库公开后，用户可以在 Codex 中直接说：

```text
请把 <GitHub 仓库地址> 下载到本机，完整阅读 README.md 和 AGENTS.md，
检查 Node.js、pnpm、ffmpeg、ffprobe，安装项目依赖并告诉我后续怎么使用。
```

Codex 应只在用户指定或确认的目录中克隆仓库，随后执行环境检查、`pnpm install` 和 `pnpm check`，再根据下面两条路径说明使用方法。仓库不附带用户视频和历史项目。

### 方式一：直接在编导台剪辑

1. 启动编导台。
2. 在首页点击“直接导入视频新建项目”。
3. 可以一次选择一段或多段视频。多段视频会保持独立，并按导入顺序进入原片轨道。
4. 在时间线中裁切、排序、添加素材和动效并保存。

### 方式二：让 Codex 先生成初剪

1. 把原始视频放入：

   ```text
   input/videos/
   ```

2. 如果有 UTF-8 SRT，把同名字幕放入：

   ```text
   input/subtitles/
   ```

3. 在 Codex 中打开本仓库，直接说：

   ```text
   分析 input/videos 里的这条视频，生成初剪方案。
   ```

4. Codex 会使用仓库内的 `$visual-workbench-video` Skill，输出：

   ```text
   workbench-output/plans/<项目ID>/rough-cut-plan.md
   workbench-output/plans/<项目ID>/rough-cut-plan.json
   ```

5. Codex 会先展示每个保留片段的来源文件、源入点、源出点、成片时间和理由，然后等待确认。此时不会修改原视频，也不会创建编导台项目。
6. 确认方案后说：

   ```text
   确认，按这个初剪方案导入编导台。
   ```

7. Codex 校验方案后，会把原始文件复制到项目素材目录并创建：

   ```text
   public/projects/<项目ID>/project.json
   ```

8. 刷新编导台首页，项目会出现在“最近项目”中。

SRT 优先。如果没有 SRT，Codex 会使用当前环境可用的转写能力；当前环境没有转写能力时，它会要求补充 SRT，不会猜测口播内容。

## 用自然语言导出

编辑完成并点击一次“保存”后，可以对 Codex 说：

```text
导出 <项目名称或项目ID> 的视频。
```

Codex 会定位唯一项目并执行：

```bash
pnpm render:project -- "<项目名称或项目ID>"
```

导出文件位于：

```text
exports/
```

导出保持项目设置中的分辨率和帧率，使用高质量 H.264 与 AAC。由于画面叠加和动效需要重新编码，不应把它描述成“绝对无损”。

## 安装

需要：

- macOS（桌面包目前面向 Apple Silicon）
- Node.js 20～24（推荐 Node.js 24 LTS；暂不使用 Node.js 25）
- pnpm
- ffmpeg 与 ffprobe

安装依赖：

```bash
pnpm install
```

检查环境：

```bash
node --version
pnpm --version
ffmpeg -version
ffprobe -version
```

## 启动

浏览器开发模式：

```bash
pnpm dev
```

本地桌面模式：

```bash
pnpm desktop:dev
```

构建 macOS 本地应用：

```bash
pnpm desktop:package
```

生成位置：

```text
outputs/desktop/mac-arm64/影猫可视化编导台.app
```

本地开发和自己使用不需要服务器，也不需要注册 Apple 开发者账号。向其他用户公开分发 `.app` 时，建议使用 Apple Developer ID 完成签名和公证；未经签名的本地开发包可能需要通过 macOS 的“隐私与安全性”手动允许打开。

## 常用命令

```bash
# 构建与测试
pnpm check

# 读取 input/videos 的媒体信息
pnpm media:inspect

# 仅在用户确认方案后执行
pnpm plan:apply -- workbench-output/plans/<项目ID>/rough-cut-plan.json

# 导出项目
pnpm render:project -- "<项目名称或项目ID>"
```

## 数据与隐私

这些目录默认不会提交到 Git：

```text
input/videos/
input/subtitles/
workbench-output/
public/projects/
exports/
outputs/
```

原始视频只读；初剪不会覆盖或删除 `input/videos/` 中的文件。项目使用原始素材进行正式渲染，编辑代理只用于提升预览流畅度。

## 公开版边界

- 公开版只有“素材”和“动效”两个主列表。
- 不包含私有项目、历史口播内容、预审面板或检查导出面板。
- 动效库只保留通用备用动效和公开文字动效。
- 不执行任意第三方 React、JavaScript 或远程模板代码。
- 初剪必须经过“方案展示 → 用户明确确认 → 写入项目”的阶段门。

## Codex 如何识别工作流

仓库根目录的 [AGENTS.md](AGENTS.md) 会要求 Codex 优先读取：

```text
.codex/skills/visual-workbench-video/SKILL.md
```

因此用户不需要复制复杂提示词。把视频放入规定目录后，直接用自然语言说明“分析并生成初剪”“确认并导入”或“导出某项目”即可。

## License

[MIT](LICENSE)


---

## 署名与来源

本仓库是 [a9-visual-workbench](https://github.com/dangminhhuong71567-oss/a9-visual-workbench) 的派生版本（白标定制）。

- 原作者：A nine <dangminhhuong71567@gmail.com>
- 原许可证：MIT（原始版权声明与许可证全文保留于 `LICENSE`，未改动）
- 本派生版本修改部分版权：Copyright (c) 2026 Alex (lf1810)

修改范围：产品名称（AI 可视化编导台 → CodeX可视化编导台）、包元数据（author）与来源署名；核心实现来自原项目。
详见根目录 [`NOTICE`](./NOTICE)。

> 本仓库地址：https://github.com/lf1810/Alex/tree/main/projects/visual-workbench
