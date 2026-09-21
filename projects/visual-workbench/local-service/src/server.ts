import {existsSync} from "node:fs";
import {resolve} from "node:path";
import express from "express";
import multer from "multer";
import {attachAsset, createProjectFromMedia, deleteProject, importOwnedAsset, listAutosaves, listMotionPresets, listProjects, listRecordings, openSystemRecording, projectBundle, publicRoot, renameProject, restoreAutosave, saveCandidateProject, saveMotionPreset} from "./project-store.js";
import {findMediaTool} from "./media-tools.js";

const app = express();
const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 1024 * 1024 * 1024}});
const port = Number(process.env.VISUAL_WORKBENCH_PORT ?? process.env.AJIU_WORKBENCH_PORT ?? 4318);
const param = (value: string | string[] | undefined, name: string): string => {
  if (typeof value !== "string" || !value) throw new Error(`缺少路径参数：${name}`);
  return value;
};

app.use(express.json({limit: "12mb"}));
app.use("/media", express.static(publicRoot, {fallthrough: false, immutable: false}));
// Remotion `staticFile()` resolves ProjectDocument asset paths from the origin
// root (for example `/projects/...`), matching Vite's public directory behavior.
// Keep the `/media` alias for downloads, while also exposing the same immutable
// source tree at the origin root for Player video, image and audio requests.
app.use(express.static(publicRoot, {fallthrough: true, immutable: false}));

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    remotionMode: "same-source-editable",
    ffmpeg: Boolean(findMediaTool("ffmpeg")),
    ffprobe: Boolean(findMediaTool("ffprobe")),
    storageRoot: publicRoot,
  });
});

app.get("/api/projects", async (_request, response, next) => {
  try { response.json(await listProjects()); } catch (error) { next(error); }
});

app.get("/api/projects/:projectId", async (request, response, next) => {
  try { response.json(await projectBundle(param(request.params.projectId, "projectId"))); } catch (error) { next(error); }
});

app.patch("/api/projects/:projectId/name", async (request, response, next) => {
  try { response.json(await renameProject(param(request.params.projectId, "projectId"), request.body?.name)); } catch (error) { next(error); }
});

app.delete("/api/projects/:projectId", async (request, response, next) => {
  try { response.json(await deleteProject(param(request.params.projectId, "projectId"))); } catch (error) { next(error); }
});

app.put("/api/projects/:projectId", async (request, response, next) => {
  try {
    const action = typeof request.body?.lastAction === "string" ? request.body.lastAction : "编辑项目";
    response.json(await saveCandidateProject(param(request.params.projectId, "projectId"), request.body?.project, action));
  } catch (error) { next(error); }
});

app.get("/api/projects/:projectId/autosaves", async (request, response, next) => {
  try { response.json(await listAutosaves(param(request.params.projectId, "projectId"))); } catch (error) { next(error); }
});

app.post("/api/projects/:projectId/autosaves/:revision/restore", async (request, response, next) => {
  try { response.json(await restoreAutosave(param(request.params.projectId, "projectId"), Number.parseInt(param(request.params.revision, "revision"), 10))); } catch (error) { next(error); }
});

app.post("/api/projects/:projectId/recordings/open", async (request, response, next) => {
  try { response.status(202).json(await openSystemRecording(param(request.params.projectId, "projectId"))); } catch (error) { next(error); }
});

app.get("/api/projects/:projectId/recordings", async (request, response, next) => {
  try { response.json(await listRecordings(param(request.params.projectId, "projectId"))); } catch (error) { next(error); }
});

app.get("/api/motion-presets", async (_request, response, next) => {
  try { response.json(await listMotionPresets()); } catch (error) { next(error); }
});

app.post("/api/projects/:projectId/motion-presets", async (request, response, next) => {
  try { response.status(201).json(await saveMotionPreset(param(request.params.projectId, "projectId"), request.body)); } catch (error) { next(error); }
});

app.post("/api/projects/create-from-media", upload.array("files", 30), async (request, response, next) => {
  try {
    const files = Array.isArray(request.files) ? request.files : [];
    response.status(201).json(await createProjectFromMedia(files, typeof request.body?.name === "string" ? request.body.name : undefined));
  } catch (error) { next(error); }
});

app.post("/api/projects/:projectId/assets/:assetId", upload.single("file"), async (request, response, next) => {
  try {
    if (!request.file) throw new Error("没有收到素材文件");
    response.status(201).json(await attachAsset(param(request.params.projectId, "projectId"), param(request.params.assetId, "assetId"), request.file));
  } catch (error) { next(error); }
});

app.post("/api/projects/:projectId/assets-import", upload.array("files", 100), async (request, response, next) => {
  try {
    const files = Array.isArray(request.files) ? request.files : [];
    if (!files.length) throw new Error("没有收到素材文件");
    response.status(201).json(await Promise.all(files.map((file) => importOwnedAsset(param(request.params.projectId, "projectId"), file))));
  } catch (error) { next(error); }
});

const appDistRoot = process.env.VISUAL_WORKBENCH_APP_DIST
  ? resolve(process.env.VISUAL_WORKBENCH_APP_DIST)
  : process.env.AJIU_APP_DIST
    ? resolve(process.env.AJIU_APP_DIST)
    : undefined;
if (appDistRoot && existsSync(resolve(appDistRoot, "index.html"))) {
  app.use(express.static(appDistRoot, {fallthrough: true, immutable: false}));
  app.use((request, response, next) => {
    if (request.method !== "GET" || !request.accepts("html")) return next();
    response.sendFile(resolve(appDistRoot, "index.html"));
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "未知错误";
  console.error(`[workbench-service] ${_request.method} ${_request.originalUrl} error-base64=${Buffer.from(message, "utf8").toString("base64")}`);
  const status = message.includes("不存在") ? 404 : message.includes("已存在") ? 409 : 400;
  response.status(status).json({error: message});
});

const server = app.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`Visual workbench service: http://127.0.0.1:${actualPort}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
