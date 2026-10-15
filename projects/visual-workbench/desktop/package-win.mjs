#!/usr/bin/env node
// Build a portable Windows desktop app for the visual workbench.
//
// Mirrors `package-mac.mjs`, but uses only Windows-safe operations:
//   * the Electron win32-x64 distribution is copied instead of `ditto`-ing an .app bundle
//   * `electron.exe` is renamed to the product name (no Info.plist, no codesign)
//   * project data is pointed at this working copy through `data-root.json`, so the
//     desktop app, the browser mode and `pnpm render:project` share one `public/` folder
//
// Usage: node desktop/package-win.mjs   (run `pnpm desktop:prepare` first)
import {execFile} from "node:child_process";
import {cp, mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {createPackage} from "@electron/asar";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, "..");
const outputRoot = resolve(workspaceRoot, "outputs/desktop/win-x64");
const productName = "影猫可视化编导台";
const sourceDist = resolve(here, "node_modules/electron/dist");
const executableName = `${productName}.exe`;

if (process.platform !== "win32") {
  throw new Error("package-win.mjs 只能在 Windows 上运行；macOS 请使用 pnpm desktop:package");
}
if (!existsSync(sourceDist)) {
  throw new Error(`未找到 Electron 运行时：${sourceDist}\n请先安装依赖（pnpm install），Electron 二进制缺失时可设置 ELECTRON_MIRROR 后重试。`);
}
for (const required of ["app/dist/index.html", "local-service/dist/server.js"]) {
  if (!existsSync(resolve(workspaceRoot, required))) {
    throw new Error(`缺少构建产物 ${required}，请先运行 pnpm desktop:prepare`);
  }
}

console.log("清理输出目录", outputRoot);
await rm(outputRoot, {recursive: true, force: true});
await mkdir(outputRoot, {recursive: true});

console.log("复制 Electron 运行时");
await cp(sourceDist, outputRoot, {recursive: true});

const resources = resolve(outputRoot, "resources");
const packagedApp = resolve(resources, "app");
const packagedWorkbench = resolve(resources, "workbench");

await rm(resolve(resources, "default_app.asar"), {force: true});
await rm(packagedApp, {recursive: true, force: true});
await rm(packagedWorkbench, {recursive: true, force: true});
await mkdir(packagedApp, {recursive: true});
await mkdir(resolve(packagedWorkbench, "local-service/dist"), {recursive: true});
await mkdir(resolve(packagedWorkbench, "library/motion_presets"), {recursive: true});

for (const file of ["main.mjs", "package.json"]) {
  await cp(resolve(here, file), resolve(packagedApp, file));
}
await cp(resolve(workspaceRoot, "app/dist"), resolve(packagedWorkbench, "app/dist"), {recursive: true});
await cp(resolve(workspaceRoot, "library/motion_presets"), resolve(packagedWorkbench, "library/motion_presets"), {recursive: true});

console.log("打包本地服务");
const esbuildEntry = resolve(workspaceRoot, "node_modules/esbuild/bin/esbuild");
await execFileAsync(process.execPath, [
  esbuildEntry,
  resolve(workspaceRoot, "local-service/dist/server.js"),
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--target=node20",
  `--outfile=${resolve(packagedWorkbench, "local-service/dist/server.bundle.cjs")}`,
]);

// Share one project folder with the repository working copy: the desktop app writes
// to the same `public/projects` that the browser mode and the render script read.
await writeFile(resolve(packagedWorkbench, "data-root.json"), `${JSON.stringify({
  publicRoot: resolve(workspaceRoot, "public"),
  workspaceRoot,
}, null, 2)}\n`);

const packagedPackagePath = resolve(packagedApp, "package.json");
const packagedPackage = JSON.parse(await readFile(packagedPackagePath, "utf8"));
delete packagedPackage.scripts;
delete packagedPackage.devDependencies;
await writeFile(packagedPackagePath, `${JSON.stringify(packagedPackage, null, 2)}\n`);

console.log("写入 app.asar");
await createPackage(packagedApp, resolve(resources, "app.asar"));
await rm(packagedApp, {recursive: true, force: true});

const sourceExe = resolve(outputRoot, "electron.exe");
const targetExe = resolve(outputRoot, executableName);
if (existsSync(sourceExe)) {
  await rename(sourceExe, targetExe);
}

console.log(`\n桌面版已生成：\n${targetExe}\n数据目录：${resolve(workspaceRoot, "public")}\n双击即可打开编导台。`);
