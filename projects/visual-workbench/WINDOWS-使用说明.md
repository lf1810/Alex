# 影猫可视化编导台 · Windows 使用说明

> 品牌名：**影猫**（2026-10-16 由 A9 / CodeX 更名；界面图标、窗口标题、项目自动命名、安装包文件名为准）。

本文件记录 2026-10-11 在 Windows 上完成安装、测试与启动的结果，以及日常使用方式。
上游文档见 [README.md](README.md) 与 [AGENTS.md](AGENTS.md)，本文件只补充 Windows 环境差异。

## 一、本机环境与验证结果

| 项目 | 状态 |
| --- | --- |
| 安装位置 | `E:\Deepseek workspace\visual-workbench` |
| Node.js | v24.18.0（系统 `C:\Program Files\nodejs\node.exe`，满足 `>=20 <25`） |
| pnpm | 11.9.0（DSH 内置：`%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs`） |
| ffmpeg / ffprobe | 8.1.1（WinGet Gyan.FFmpeg；服务健康检查已确认识别） |
| 依赖安装 | `pnpm install` 成功，392 个包 |
| 构建与测试 | `pnpm check` 通过：10 个 workspace 包构建成功，测试 10/10 通过 |
| 冒烟验证 | 导入 6 秒视频 → 裁切 + 加动效 → 保存（revision 1）→ 导出 1280×720 / 30fps H.264+AAC MP4，均成功 |
| 访问地址 | 编导台 `http://127.0.0.1:4317/`，本地服务 `http://127.0.0.1:4318` |

## 二、启动与停止

启动（在项目根目录）：

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
cd "E:\Deepseek workspace\visual-workbench"
& $node scripts/workbench-supervisor.mjs
```

该命令会同时拉起本地服务（4318）与前端（4317），任一进程退出会自动重启。
浏览器打开 `http://127.0.0.1:4317/` 即可使用。

也可以直接双击项目根目录的 **`启动编导台（浏览器版）.cmd`**：它会先探测 4317 是否已在运行，
没运行才拉起 supervisor，然后打开浏览器。

`scripts/start-stable-workbench.sh` 与 `stop-stable-workbench.sh` 依赖 macOS 的 `screen`，Windows 上不要使用。

## 三、导入视频

1. 打开首页，点击 **“导入一段或多段视频新建项目”**。
2. 可一次选择一段或多段视频；多段视频保持独立，按选择顺序进入原片轨道。
3. 视频会被复制到 `public/projects/<项目ID>/assets/original/`，原始文件不被改动。

## 四、剪辑

- 时间线为多轨结构：原片轨（`track-aroll`）、动效轨（`track-overlays`）、字幕轨（`track-captions`）。
- 拖拽片段调整位置，拖动边缘裁切；普通轨道有 4 帧吸附，尾部预留 30 秒编辑余量。
- 工具栏提供 “原片顶死” 开关、“一键清除动效”、“一键清除字幕”。
- 右侧动效面板可挑选公开动效（共 8 个社区文字动效 + 备用动效）并调整参数。

## 五、保存与恢复

- 顶部 **“保存”** 按钮写入 `public/projects/<项目ID>/project.json`，标题旁显示 `已保存 · v0001`。
- 每次保存会额外生成恢复点：`public/projects/<项目ID>/autosave/`。
- 顶部 **“恢复点”** 按钮可查看历史版本并一键恢复。
- 服务中断时前端会把修改留在本机草稿，服务恢复后可继续保存。

## 六、导出视频

编导台界面内没有导出按钮，导出由命令行完成（保持项目设置的分辨率与帧率，高质量 H.264 + AAC；因叠加动效会重新编码，不是“绝对无损”）：

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
cd "E:\Deepseek workspace\visual-workbench"
& $node $pnpm render:project -- "<项目名称或项目ID>"
```

- 先点击一次界面上的 “保存”，确保写盘后再导出。
- 导出文件位于 `exports/`，文件名形如 `<项目ID>-<时间戳>.mp4`。
- 名称不唯一时命令会报错并列出候选项目 ID，需改用项目 ID 重试。

## 七、Windows 桌面版（双击打开）

上游只提供 macOS 打包脚本，这里补了一套 Windows 打包：

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
cd "E:\Deepseek workspace\visual-workbench"
& $node $pnpm desktop:package:win      # = pnpm desktop:prepare + node desktop/package-win.mjs
```

产物（免安装，双击即可）：

```text
outputs/desktop/win-x64/影猫可视化编导台.exe
```

设计要点：

- `desktop/package-win.mjs`：复制 Electron win32-x64 运行时、把 `electron.exe` 改名为产品名并打包
  `resources/app.asar`，不使用 `ditto` / `PlistBuddy` / `codesign` 等 macOS 工具。
- 打包时写入 `resources/workbench/data-root.json`，把数据目录指向本仓库的 `public/`。
  所以**桌面版、浏览器模式、`pnpm render:project` 读写的是同一份项目目录**，桌面版里改完可以直接导出。
- `desktop/main.mjs`：菜单按平台分流（Windows 不再出现「隐藏其他 / 缩放」这类 macOS 专属项）；
  `data-root.json` 不存在时仍沿用上游行为，数据放在 `%APPDATA%\影猫可视化编导台\workspace`。
- Electron 二进制来自 npmmirror（GitHub Releases 在本机不可达）：
  设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后运行
  `node node_modules/.pnpm/electron@38.4.0/node_modules/electron/install.js`。

备用入口：项目根目录的 `启动编导台（浏览器版）.cmd`（见第二节）。桌面版万一启动异常，用它继续干活。

## 八、为 Windows 做的其它适配

1. `local-service/src/media-tools.ts`：原实现只按无扩展名路径探测 ffmpeg/ffprobe，Windows 上必然找不到
   `ffmpeg.exe`。现按平台追加 `.exe / .cmd / .bat` 候选，POSIX 分支与错误文案保持不变。
2. `packages/video-engine/bin/render-project-job.mjs`：新增可选环境变量 `VISUAL_WORKBENCH_BROWSER`。
   不设置时行为与上游一致（Remotion 自行下载 Chrome Headless Shell）；设置后复用已安装的 Chromium，
   避免在慢速网络下等待上百 MB 下载：

   ```powershell
   $env:VISUAL_WORKBENCH_BROWSER = "C:\Program Files\Google\Chrome\Application\chrome.exe"
   ```

3. `desktop/main.mjs` + `desktop/package-win.mjs`：桌面版的跨平台菜单与 Windows 打包（见上一节）。

其余按上游文档执行；以上改动前后 `pnpm check` 均为通过。

## 九、已知限制（Windows）

- 桌面版我只验证到「打包结构 + 打包后的本地服务 + 共享数据 + 前端页面」这一层：当前自动化会话没有可用的
  GUI 窗口，Electron（包括上游官方原版）在这里启动即崩（退出码 0xC0000005 / 0x80000003），我无法代你点开窗口。
  首次双击请你确认一次；若打不开，`%APPDATA%\影猫可视化编导台\logs\desktop.log` 里会有原因。
- 同理，`pnpm desktop:dev`（`electron .`）在自动化会话里也起不来；双击 exe 或在普通终端中运行不受影响。
- “打开系统录制” 调用 macOS 的 `screencapture`，Windows 上不可用；需要录屏请在编导台外录制后再导入。
- 上游 `start-stable-workbench.sh` / `stop-stable-workbench.sh` 为 macOS `screen` 脚本，Windows 请用
  supervisor 命令或 `启动编导台（浏览器版）.cmd`。

## 十、页面白屏怎么办

浏览器模式白屏的典型原因是 **Vite 的模块缓存与 `packages/*/dist` 里的编译产物不一致**：
只要在开发服务器运行期间重新执行过构建（`pnpm check` / `pnpm desktop:prepare` / `desktop:package:win`），
Vite 就可能把某个正在被重写的模块（例如 `packages/video-engine/dist/EditorComposition.js`）缓存成半截产物，
之后页面加载时报：

```text
Uncaught SyntaxError: The requested module '.../EditorComposition.js' does not provide an export named 'EditorComposition'
```

处理顺序：

1. 先按 `Ctrl + Shift + R` 硬刷新一次；无效再往下。
2. 停掉 supervisor（关掉它的窗口 / 结束 `node scripts/workbench-supervisor.mjs` 进程）。
3. 删掉 Vite 缓存目录 `app/node_modules/.vite`。
4. 重新跑 `node scripts/workbench-supervisor.mjs`（或双击 `启动编导台（浏览器版）.cmd`）。

页面里的未保存修改存在浏览器 localStorage，重启服务不会丢；项目文件、素材和恢复点都在
`public/projects/` 下，也不受缓存影响。

**避免复现**：改完源码要重新构建时，先停掉开发服务器，构建完再启动；不要在服务运行中反复重跑构建。

