# 影猫可视化编导台 · Windows 使用说明

> 本文面向**从压缩包开始安装**的用户；最后一节附作者本机开发环境，仅作参考。

上游文档见 [README.md](README.md) 与 [AGENTS.md](AGENTS.md)，本文只补充 Windows 的从零安装流程与平台差异。

## 一、准备环境（三样，缺一不可）

### 1. Node.js 20 ～ 24

推荐 Node.js 24 LTS。任选其一：

```powershell
winget install OpenJS.NodeJS.LTS     # 或到 https://nodejs.org 下载安装包
node -v                              # 应显示 v20.x ～ v24.x
```

### 2. pnpm

```powershell
corepack enable                      # Node 自带的包管理器代理（推荐）
# 或在任意目录执行：
npm install -g pnpm@11
pnpm -v                              # 应显示 11.x
```

### 3. FFmpeg 与 ffprobe

编导台依赖它们读取时长、生成预览、导出成片：

```powershell
winget install Gyan.FFmpeg
ffmpeg -version
ffprobe -version
```

装完请**新开一个终端**让它们进入 PATH。如果不想改 PATH，也可以用环境变量直接指定：

```powershell
$env:VISUAL_WORKBENCH_FFMPEG  = "D:\ffmpeg\bin\ffmpeg.exe"
$env:VISUAL_WORKBENCH_FFPROBE = "D:\ffmpeg\bin\ffprobe.exe"
```

## 二、解压与安装依赖

1. 把 `影猫可视化编导台.zip` 解压到任意目录。建议路径**不含空格与中文**，例如 `D:\tools\`。
2. 在该目录打开 PowerShell，执行：

```powershell
pnpm install     # 安装依赖（压缩包内不含 node_modules，必须执行）
pnpm check       # 可选但推荐：构建全部子包并跑测试，最后应显示 10/10 通过
```

> 首次 `pnpm install` 需要联网。只有在你打算打包桌面版时，才会额外下载 Electron（约 100MB+）。

## 三、启动

### 方式 A（推荐）

```powershell
pnpm dev
```

然后浏览器打开 **http://127.0.0.1:4317/** 。

### 方式 B（双击启动）

先执行过一次 `pnpm check`（会生成 `local-service/dist` 构建产物），之后双击项目根目录的
**`启动编导台（浏览器版）.cmd`**：它会先探测 4317 是否已在运行，没运行才拉起本地服务与前端，然后打开浏览器。

### 端口说明

前端 4317，本地服务 4318。端口被占用时启动会失败，请先结束占用进程；服务端口也可以用环境变量
`VISUAL_WORKBENCH_PORT` 修改（改完记得同步 `app/vite.config.ts` 里的代理地址）。

## 四、导入视频

1. 打开首页，点击 **「导入一段或多段视频新建项目」**。
2. 可一次选择一段或多段视频；多段视频保持独立，按选择顺序进入原片轨道。
3. 视频会被复制到 `public/projects/<项目ID>/assets/original/`，原始文件不被改动。

## 五、剪辑

- 时间线为多轨结构：原片轨（`track-aroll`）、动效轨（`track-overlays`）、字幕轨（`track-captions`）。
- 拖拽片段调整位置，拖动边缘裁切；普通轨道有 4 帧吸附，尾部预留 30 秒编辑余量。
- 工具栏提供「原片顶死」开关、「一键清除动效」、「一键清除字幕」。
- 右侧动效面板可挑选公开动效（共 8 个社区文字动效 + 备用动效）并调整参数。

## 六、保存与恢复

- 顶部 **「保存」** 按钮写入 `public/projects/<项目ID>/project.json`，标题旁显示 `已保存 · v0001`。
- 每次保存会额外生成恢复点：`public/projects/<项目ID>/autosave/`。
- 顶部 **「恢复点」** 按钮可查看历史版本并一键恢复。
- 服务中断时前端会把修改留在本机草稿，服务恢复后可继续保存。

## 七、导出视频

界面内没有导出按钮，导出由命令行完成（保持项目设置的分辨率与帧率，高质量 H.264 + AAC；
因叠加动效会重新编码，不是「绝对无损」）：

```powershell
pnpm check                                  # 首次导出前需要构建产物
pnpm render:project -- "<项目名称或项目ID>"
```

- 导出前先在界面点一次「保存」。
- 产物在 `exports/`，文件名形如 `<项目ID>-<时间戳>.mp4`。
- 名称不唯一时命令会报错并列出候选项目 ID，改用项目 ID 重试。

## 八、可选：打包成免安装桌面程序

```powershell
pnpm desktop:package:win
```

产物：`outputs/desktop/win-x64/影猫可视化编导台.exe`，双击即开，不需要浏览器。

- 打包时会把数据目录指向本仓库的 `public/`，所以桌面版、浏览器模式与导出脚本**共用同一份项目数据**。
- 首次打包会下载 Electron；官方源较慢时可以先设置镜像：
  `$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"`

## 九、常见问题

### 页面白屏

典型原因是 Vite 的模块缓存与 `packages/*/dist` 里的编译产物不一致（多见于开发服务器运行期间重新构建）。
处理顺序：

1. `Ctrl + Shift + R` 硬刷新一次；无效再往下。
2. 停掉正在运行的编导台（关掉 supervisor 窗口）。
3. 删除 `app/node_modules/.vite`。
4. 重新 `pnpm dev`（或双击启动脚本）。

页面里未保存的修改存在浏览器 localStorage，重启不会丢；项目、素材和恢复点都在 `public/projects/` 下。

**避免复现**：改完源码要重新构建时，先停掉开发服务器，构建完再启动。

### 提示找不到 ffmpeg / ffprobe

按第一节第 3 步安装，或用 `VISUAL_WORKBENCH_FFMPEG` / `VISUAL_WORKBENCH_FFPROBE` 指定可执行文件路径，
然后重启编导台。首页右上角的 `✓ FFmpeg` `✓ ffprobe` 两盏灯变绿即正常。

### 导出卡在 Downloading Chrome Headless Shell

Remotion 首次导出会下载无头浏览器。网络较慢时可以直接复用本机已安装的 Chrome：

```powershell
$env:VISUAL_WORKBENCH_BROWSER = "C:\Program Files\Google\Chrome\Application\chrome.exe"
pnpm render:project -- "<项目名称或项目ID>"
```

### 桌面版双击没反应

查看日志 `%APPDATA%\影猫可视化编导台\logs\desktop.log`；也可以先用浏览器模式确认环境正常
（`pnpm dev`），再重新打包。桌面版依赖打包时构建好的 `app/dist` 与服务 bundle。

## 十、已知限制

- 「案例录屏 / 打开系统录制」调用的是 macOS 的 `screencapture`，Windows 上不可用；请在编导台外录屏后再导入。
- 上游的 `desktop/package-mac.mjs` 与 `scripts/*.sh` 面向 macOS，Windows 请使用本文的命令与
  `desktop/package-win.mjs`。
- 本项目是本地工具：项目文件、素材与成片都保存在本机，不需要服务器。

## 附：作者本机开发环境（仅参考）

- 安装位置 `E:\Deepseek workspace\visual-workbench`；Node v24.18、pnpm 11.9、ffmpeg 8.1.1。
- 该机上 node 与 pnpm 取自 DSH 运行时，命令形如
  `& "$env:USERPROFILE\.dsh\dsh-runtimes\...\node.exe" "$env:USERPROFILE\.dsh\...\pnpm.mjs" install`。
- 通用环境按第一、二节的 `node` / `pnpm` 直接使用即可，无需这段。
