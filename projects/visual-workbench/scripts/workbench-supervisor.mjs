import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
let stopping = false;
const children = new Map();

const definitions = {
  service: {args: [resolve(root, "local-service/dist/server.js")], cwd: root},
  app: {args: [resolve(root, "app/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4317"], cwd: resolve(root, "app")},
};

const start = (name) => {
  if (stopping) return;
  process.stderr.write(`[supervisor] starting ${name}\n`);
  const definition = definitions[name];
  const child = spawn(node, definition.args, {cwd: definition.cwd, stdio: "inherit", env: process.env});
  children.set(name, child);
  child.once("spawn", () => process.stderr.write(`[supervisor] ${name} pid=${child.pid}\n`));
  child.once("error", (cause) => process.stderr.write(`[supervisor] ${name} spawn error: ${cause.message}\n`));
  child.once("exit", (code, signal) => {
    children.delete(name);
    if (stopping) return;
    process.stderr.write(`[supervisor] ${name} exited (${signal ?? code}); restarting\n`);
    setTimeout(() => start(name), 800);
  });
};

const shutdown = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1_500).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);

start("service");
start("app");
