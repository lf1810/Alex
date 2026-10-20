import {spawn} from "node:child_process";
import {createWriteStream, existsSync, readFileSync} from "node:fs";
import {mkdir} from "node:fs/promises";
import {delimiter, dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {app, BrowserWindow, dialog, Menu, shell} from "electron";

const here = dirname(fileURLToPath(import.meta.url));
const packagedWorkbenchRoot = resolve(process.resourcesPath, "workbench");
const packagedRuntime = existsSync(resolve(packagedWorkbenchRoot, "app/dist/index.html"));
const workspaceRoot = process.env.VISUAL_WORKBENCH_ROOT
  || process.env.AJIU_WORKBENCH_ROOT
  || (packagedRuntime ? packagedWorkbenchRoot : resolve(here, ".."));
const appDistRoot = resolve(workspaceRoot, "app/dist");
const serviceScript = resolve(workspaceRoot, "local-service/dist", packagedRuntime ? "server.bundle.cjs" : "server.js");
// A packaged build can point its project data at an existing working copy, so the
// browser mode, the desktop app and `pnpm render:project` all read the same
// `public/projects` folder. Without `data-root.json` the packaged app keeps the
// upstream behaviour and stores data under the per-user Electron data directory.
const sharedData = (() => {
  if (!packagedRuntime) return {};
  try {
    const file = resolve(packagedWorkbenchRoot, "data-root.json");
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      publicRoot: typeof parsed.publicRoot === "string" ? resolve(parsed.publicRoot) : undefined,
      workspaceRoot: typeof parsed.workspaceRoot === "string" ? resolve(parsed.workspaceRoot) : undefined,
    };
  } catch {
    return {};
  }
})();
const dataWorkspaceRoot = sharedData.workspaceRoot
  ?? (packagedRuntime ? resolve(app.getPath("userData"), "workspace") : workspaceRoot);
const publicRoot = process.env.VISUAL_WORKBENCH_PUBLIC_ROOT
  ? resolve(process.env.VISUAL_WORKBENCH_PUBLIC_ROOT)
  : sharedData.publicRoot
    ?? (packagedRuntime ? resolve(app.getPath("userData"), "workspace", "public") : resolve(workspaceRoot, "public"));
const desktopPath = [
  ...(process.env.PATH ?? "").split(delimiter).filter(Boolean),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
].filter((entry, index, entries) => entries.indexOf(entry) === index).join(delimiter);

let serviceProcess;
let mainWindow;
let serviceUrl;
let quitting = false;

const appendLog = async (message) => {
  const logDirectory = resolve(app.getPath("userData"), "logs");
  await mkdir(logDirectory, {recursive: true});
  const stream = createWriteStream(resolve(logDirectory, "desktop.log"), {flags: "a"});
  stream.end(`[${new Date().toISOString()}] ${message}\n`);
};

const assertRuntime = () => {
  const missing = [
    [workspaceRoot, "编导台工作目录"],
    [appDistRoot, "桌面界面构建"],
    [resolve(appDistRoot, "index.html"), "桌面入口文件"],
    [serviceScript, "本地保存服务"],
  ].filter(([path]) => !existsSync(path));
  if (!missing.length) return;
  throw new Error(missing.map(([path, label]) => `${label}不存在：${path}`).join("\n"));
};

const startLocalService = async () => {
  assertRuntime();
  await mkdir(resolve(publicRoot, "projects"), {recursive: true});
  return new Promise((resolveStart, rejectStart) => {
  let settled = false;
  const child = spawn(process.execPath, [serviceScript], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      VISUAL_WORKBENCH_ROOT: dataWorkspaceRoot,
      VISUAL_WORKBENCH_PUBLIC_ROOT: publicRoot,
      VISUAL_WORKBENCH_PORT: "0",
      VISUAL_WORKBENCH_APP_DIST: appDistRoot,
      PATH: desktopPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serviceProcess = child;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectStart(new Error("本地保存服务启动超时"));
  }, 30_000);

  const handleOutput = (kind, chunk) => {
    const text = chunk.toString("utf8");
    void appendLog(`${kind}: ${text.trim()}`);
    const match = text.match(/Visual workbench service: (http:\/\/127\.0\.0\.1:\d+)/);
    if (!match || settled) return;
    settled = true;
    clearTimeout(timer);
    serviceUrl = match[1];
    resolveStart(serviceUrl);
  };
  child.stdout.on("data", (chunk) => handleOutput("service", chunk));
  child.stderr.on("data", (chunk) => handleOutput("service-error", chunk));
  child.once("error", (error) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      rejectStart(error);
    }
  });
  child.once("exit", (code, signal) => {
    void appendLog(`service-exit: code=${code} signal=${signal}`);
    serviceProcess = undefined;
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "本地服务已停止",
        message: "编导台的本地保存服务意外停止。",
        detail: "请关闭并重新打开桌面编导台。当前页面中的未保存内容仍会保留在本机草稿中。",
      });
    }
  });
  });
};

const createMainWindow = async (url) => {
  const window = new BrowserWindow({
    title: "影猫可视化编导台",
    width: 1680,
    height: 1050,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#071019",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !packagedRuntime,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(({url: target}) => {
    if (target.startsWith(url)) return {action: "allow"};
    void shell.openExternal(target);
    return {action: "deny"};
  });
  window.webContents.on("will-navigate", (event, target) => {
    if (target.startsWith(url)) return;
    event.preventDefault();
    void shell.openExternal(target);
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { mainWindow = undefined; });
  await window.loadURL(url);
};

const installMenu = () => {
  const macTemplate = [
    {
      label: "影猫可视化编导台",
      submenu: [
        {role: "about", label: "关于编导台"},
        {type: "separator"},
        {role: "hide", label: "隐藏编导台"},
        {role: "hideOthers", label: "隐藏其他"},
        {role: "unhide", label: "全部显示"},
        {type: "separator"},
        {role: "quit", label: "退出编导台"},
      ],
    },
    {
      label: "编辑",
      submenu: [
        {role: "undo", label: "撤销"},
        {role: "redo", label: "重做"},
        {type: "separator"},
        {role: "cut", label: "剪切"},
        {role: "copy", label: "复制"},
        {role: "paste", label: "粘贴"},
        {role: "selectAll", label: "全选"},
      ],
    },
    {
      label: "窗口",
      submenu: [
        {role: "minimize", label: "最小化"},
        {role: "zoom", label: "缩放"},
        {role: "togglefullscreen", label: "进入/退出全屏"},
      ],
    },
  ];
  // Windows/Linux have no native menu bar roles such as `hide` or `zoom`;
  // using the macOS template there produces dead entries.
  const windowsTemplate = [
    {
      label: "编导台",
      submenu: [
        {role: "reload", label: "重新加载界面"},
        {type: "separator"},
        {role: "quit", label: "退出编导台"},
      ],
    },
    {
      label: "编辑",
      submenu: [
        {role: "undo", label: "撤销"},
        {role: "redo", label: "重做"},
        {type: "separator"},
        {role: "cut", label: "剪切"},
        {role: "copy", label: "复制"},
        {role: "paste", label: "粘贴"},
        {role: "selectAll", label: "全选"},
      ],
    },
    {
      label: "窗口",
      submenu: [
        {role: "minimize", label: "最小化"},
        {role: "togglefullscreen", label: "进入/退出全屏"},
        {role: "close", label: "关闭窗口"},
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === "darwin" ? macTemplate : windowsTemplate));
};

const stopService = () => {
  quitting = true;
  if (serviceProcess && !serviceProcess.killed) serviceProcess.kill("SIGTERM");
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      installMenu();
      const url = await startLocalService();
      await createMainWindow(url);
    } catch (error) {
      await appendLog(`startup-error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
      dialog.showErrorBox("编导台启动失败", error instanceof Error ? error.message : String(error));
      app.quit();
    }
  });

  app.on("activate", () => {
    if (!mainWindow && serviceUrl) void createMainWindow(serviceUrl);
  });
  app.on("before-quit", stopService);
  app.on("window-all-closed", () => app.quit());
}
