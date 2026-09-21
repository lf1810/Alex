import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("both interaction experiences are present", async () => {
  const [vectorPage, particlePage] = await Promise.all([
    read("app/GestureStage.tsx"),
    read("app/particles/ParticleLab.tsx"),
  ]);

  assert.match(vectorPage, /手势交互实验室/);
  assert.match(vectorPage, /矢量折叠/);
  assert.match(vectorPage, /隐藏边栏/);
  assert.match(particlePage, /PARTICLE_COUNT = 12000/);
  assert.match(particlePage, /"sphere".*"heart".*"saturn".*"text"/s);
  assert.match(particlePage, /隐藏边栏/);
});

test("particle camera remains capture-only", async () => {
  const [particlePage, styles] = await Promise.all([
    read("app/particles/ParticleLab.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(particlePage, /className="tracking-source"/);
  assert.doesNotMatch(particlePage, /tracking-preview/);
  assert.match(styles, /\.tracking-source\s*\{[^}]*display:\s*none\s*!important/s);
});

test("public metadata uses the project brand", async () => {
  const [layout, vectorMetadata, particleMetadata] = await Promise.all([
    read("app/layout.tsx"),
    read("app/page.tsx"),
    read("app/particles/page.tsx"),
  ]);

  assert.match(layout, /手势交互实验室/);
  assert.match(vectorMetadata, /手势交互实验室/);
  assert.match(particleMetadata, /手势交互实验室/);
});
