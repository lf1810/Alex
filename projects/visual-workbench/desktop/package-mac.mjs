import {execFile} from "node:child_process";
import {cp, mkdir, readFile, rm, symlink, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {createPackage} from "@electron/asar";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, "..");
const outputRoot = resolve(workspaceRoot, "outputs/desktop/mac-arm64");
const productName = "CodeX可视化编导台";
const sourceApp = resolve(here, "node_modules/electron/dist/Electron.app");
const targetApp = resolve(outputRoot, `${productName}.app`);
const resources = resolve(targetApp, "Contents/Resources");
const packagedApp = resolve(resources, "app");
const packagedWorkbench = resolve(resources, "workbench");
const plist = resolve(targetApp, "Contents/Info.plist");

await rm(outputRoot, {recursive: true, force: true});
await mkdir(outputRoot, {recursive: true});
// macOS frameworks contain relative symlinks. `ditto` preserves those links,
// while Node's recursive copy resolves them to absolute source paths.
await execFileAsync("ditto", [sourceApp, targetApp]);
// Some package managers materialize framework symlinks as duplicate directories.
// Restore the canonical macOS framework layout before signing the bundle.
const restoreFrameworkLinks = async (name, entries) => {
  const framework = resolve(targetApp, "Contents/Frameworks", name);
  for (const entry of entries) {
    await rm(resolve(framework, entry), {recursive: true, force: true});
  }
  await rm(resolve(framework, "Versions/Current"), {recursive: true, force: true});
  await symlink("A", resolve(framework, "Versions/Current"));
  for (const entry of entries) {
    await symlink(`Versions/Current/${entry}`, resolve(framework, entry));
  }
};
await restoreFrameworkLinks("Electron Framework.framework", ["Electron Framework", "Helpers", "Libraries", "Resources"]);
await restoreFrameworkLinks("Squirrel.framework", ["Squirrel", "Resources"]);
await restoreFrameworkLinks("Mantle.framework", ["Mantle", "Resources"]);
await restoreFrameworkLinks("ReactiveObjC.framework", ["ReactiveObjC", "Resources"]);
await rm(resolve(resources, "default_app.asar"), {force: true});
await rm(packagedApp, {recursive: true, force: true});
await rm(packagedWorkbench, {recursive: true, force: true});
await mkdir(packagedApp, {recursive: true});
await mkdir(resolve(packagedWorkbench, "local-service/dist"), {recursive: true});
await mkdir(resolve(packagedWorkbench, "library/motion_presets"), {recursive: true});
await mkdir(resolve(packagedWorkbench, "public/projects"), {recursive: true});

for (const file of ["main.mjs", "package.json"]) {
  await cp(resolve(here, file), resolve(packagedApp, file));
}
await cp(resolve(workspaceRoot, "app/dist"), resolve(packagedWorkbench, "app/dist"), {recursive: true});
await cp(resolve(workspaceRoot, "library/motion_presets"), resolve(packagedWorkbench, "library/motion_presets"), {recursive: true});

await execFileAsync(resolve(workspaceRoot, "node_modules/.bin/esbuild"), [
  resolve(workspaceRoot, "local-service/dist/server.js"),
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--target=node20",
  `--outfile=${resolve(packagedWorkbench, "local-service/dist/server.bundle.cjs")}`,
]);

const packagedPackagePath = resolve(packagedApp, "package.json");
const packagedPackage = JSON.parse(await readFile(packagedPackagePath, "utf8"));
delete packagedPackage.scripts;
delete packagedPackage.devDependencies;
await writeFile(packagedPackagePath, `${JSON.stringify(packagedPackage, null, 2)}\n`);
await createPackage(packagedApp, resolve(resources, "app.asar"));
await rm(packagedApp, {recursive: true, force: true});

const plistValues = [
  ["CFBundleDisplayName", productName],
  ["CFBundleName", productName],
  ["CFBundleIdentifier", "com.visualworkbench.desktop"],
  ["CFBundleShortVersionString", "0.1.0"],
  ["CFBundleVersion", "1"],
  ["LSApplicationCategoryType", "public.app-category.video"],
];
for (const [key, value] of plistValues) {
  try {
    await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist]);
  } catch {
    await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${value}`, plist]);
  }
}

try {
  await execFileAsync("/usr/libexec/PlistBuddy", ["-c", "Delete :ElectronAsarIntegrity", plist]);
} catch {
  // The Electron source bundle may not include an integrity dictionary.
}

try {
  await execFileAsync("codesign", ["--force", "--deep", "--sign", "-", targetApp]);
} catch (error) {
  console.warn("未完成临时签名；本地开发包仍已生成。公开分发前请使用 Apple Developer ID 正式签名和公证。");
  console.warn(error instanceof Error ? error.message : String(error));
}
console.log(targetApp);
