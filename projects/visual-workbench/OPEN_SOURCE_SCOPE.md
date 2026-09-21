# 开源范围清单

## 包含

- Remotion 同源预览与本地渲染内核。
- 多轨时间线、多段视频导入、保存与恢复点。
- 通用“备用｜”动效和社区文字动效。
- 项目本地 `$visual-workbench-video` Skill。
- 带确认门的时间戳初剪方案与 ProjectDocument 写入脚本。
- 按项目名称或项目 ID 导出视频的本地命令。
- macOS Apple Silicon 桌面打包脚本。

## 不包含

- 私有项目、历史口播视频、字幕、录屏、导出成片和恢复点。
- “本片｜”动效、私有动效 2 素材、私有参考视频和吸收记录。
- 预审、检查导出、私域工作流和个人账号数据。
- 任意第三方代码执行、远程模板自动安装和云端渲染。

## 默认不会进入 Git

以下目录已写入 `.gitignore`：

```text
input/videos/
input/subtitles/
workbench-output/
public/projects/
exports/
outputs/
style_intake/inbox/
style_intake/quarantine/
library/assets/
library/motion_presets/
library/template_registry/
```

提交前应运行：

```bash
pnpm check
git status --short
git ls-files
```
