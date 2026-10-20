"use client";

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Point = { x: number; y: number };
type HandSide = "Left" | "Right";
type FingerName = "拇指" | "食指" | "中指" | "无名指" | "小指";
type Binding = { hand: HandSide; landmark: number; finger: FingerName };
type Vertex = {
  id: string;
  position: Point;
  binding: Binding | null;
  bindingState: "idle" | "candidate" | "bound" | "lost";
  lostAt: number | null;
};
type Chord = { id: string; a: string; b: string };
type Region = { id: string; vertexIds: string[]; effect: EffectId };
type GradientStop = { position: number; color: string };
type Aspect = "16:9" | "9:16" | "1:1";
type StudioState = "idle" | "ready" | "binding" | "tracking" | "partial";

type EffectId =
  | "negative"
  | "halftone"
  | "duotone"
  | "holographic"
  | "solar"
  | "cold"
  | "gradient"
  | "spectral"
  | "chrome"
  | "lattice";

const EFFECTS: Array<{ id: EffectId; name: string; detail: string; swatch: string }> = [
  { id: "negative", name: "色相负片", detail: "高对比反相影像", swatch: "linear-gradient(135deg,#f3ff65,#6248ff)" },
  { id: "halftone", name: "朱红网点", detail: "丝网印刷颗粒", swatch: "radial-gradient(#f33246 26%,#fff2db 28%)" },
  { id: "duotone", name: "钴蓝双色", detail: "冷调海报层次", swatch: "linear-gradient(135deg,#f7f1dc,#174ea6)" },
  { id: "holographic", name: "霓彩全息", detail: "液态伪彩流动", swatch: "linear-gradient(135deg,#00d9ff,#7b35ff,#ff3cad)" },
  { id: "solar", name: "热感日晒", detail: "橙红热成像", swatch: "linear-gradient(135deg,#1c0200,#ff3b08,#ffd86b)" },
  { id: "cold", name: "冰川反相", detail: "蓝青低曝光", swatch: "linear-gradient(135deg,#02071c,#0a8fa9,#d8f5ff)" },
  { id: "gradient", name: "亮度映射", detail: "自定义颜色节点", swatch: "linear-gradient(135deg,#061a3a,#00b9cc,#f02acd,#f0e52a)" },
  { id: "spectral", name: "光谱扫描", detail: "扫描束与边缘", swatch: "linear-gradient(135deg,#021220,#08b9d0,#135278)" },
  { id: "chrome", name: "液态铬膜", detail: "金属高光流场", swatch: "linear-gradient(135deg,#020735,#1ce5ff,#7d26d8,#d8fcff)" },
  { id: "lattice", name: "量子格栅", detail: "等高线与网格", swatch: "repeating-linear-gradient(45deg,#10052f 0 7px,#0ac3e6 8px 9px)" },
];

const FINGERS: Array<{ name: FingerName; landmark: number }> = [
  { name: "拇指", landmark: 4 },
  { name: "食指", landmark: 8 },
  { name: "中指", landmark: 12 },
  { name: "无名指", landmark: 16 },
  { name: "小指", landmark: 20 },
];

const DEFAULT_STOPS: GradientStop[] = [
  { position: 0, color: "#061a3a" },
  { position: 0.26, color: "#00b9cc" },
  { position: 0.54, color: "#f02acd" },
  { position: 0.78, color: "#f0e52a" },
  { position: 1, color: "#ec3434" },
];

function makePolygon(count = 4): Vertex[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const radiusX = count === 3 ? 0.32 : 0.3;
    return {
      id: `P${index + 1}`,
      position: { x: 0.5 + Math.cos(angle) * radiusX, y: 0.5 + Math.sin(angle) * 0.29 },
      binding: null,
      bindingState: "idle" as const,
      lostAt: null,
    };
  });
}

function area(points: Point[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
}

function segmentCrosses(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < -0.000001 && cdA * cdB < -0.000001;
}

function deriveRegions(
  vertices: Vertex[],
  chords: Chord[],
  priorEffects: Map<string, EffectId>,
): Region[] {
  if (!chords.length) {
    return [
      {
        id: "whole",
        vertexIds: vertices.map((vertex) => vertex.id),
        effect: priorEffects.get("whole") ?? "holographic",
      },
    ];
  }

  const points = new Map(vertices.map((vertex) => [vertex.id, vertex.position]));
  const adjacency = new Map<string, string[]>();
  const connect = (a: string, b: string) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  };
  vertices.forEach((vertex, index) => connect(vertex.id, vertices[(index + 1) % vertices.length].id));
  chords.forEach((chord) => connect(chord.a, chord.b));

  adjacency.forEach((neighbors, id) => {
    const origin = points.get(id)!;
    neighbors.sort((a, b) => {
      const pa = points.get(a)!;
      const pb = points.get(b)!;
      return (
        Math.atan2(pa.y - origin.y, pa.x - origin.x) -
        Math.atan2(pb.y - origin.y, pb.x - origin.x)
      );
    });
  });

  const visited = new Set<string>();
  const loops: string[][] = [];
  const key = (a: string, b: string) => `${a}>${b}`;
  const outerSign = Math.sign(area(vertices.map((vertex) => vertex.position))) || 1;

  adjacency.forEach((neighbors, start) => {
    neighbors.forEach((firstNext) => {
      if (visited.has(key(start, firstNext))) return;
      const loop: string[] = [];
      let from = start;
      let to = firstNext;
      for (let guard = 0; guard < 100; guard += 1) {
        visited.add(key(from, to));
        loop.push(from);
        const around = adjacency.get(to)!;
        const incoming = around.indexOf(from);
        const next = around[(incoming + 1) % around.length];
        from = to;
        to = next;
        if (from === start && to === firstNext) break;
      }
      const loopPoints = loop.map((id) => points.get(id)!);
      if (loop.length >= 3 && Math.sign(area(loopPoints)) === outerSign) loops.push(loop);
    });
  });

  const unique = new Map<string, string[]>();
  loops.forEach((loop) => {
    const startIndex = loop.reduce((best, id, index) => (id < loop[best] ? index : best), 0);
    const rotated = [...loop.slice(startIndex), ...loop.slice(0, startIndex)];
    unique.set(rotated.join("-"), rotated);
  });

  return [...unique].map(([id, vertexIds], index) => ({
    id,
    vertexIds,
    effect: priorEffects.get(id) ?? EFFECTS[(index + 3) % EFFECTS.length].id,
  }));
}

type Triangle = [Point, Point, Point];
type FoldedTriangle = { triangle: Triangle; flip: 0 | 1; crease: Point | null };

function signedArea(a: Point, b: Point, c: Point) {
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
}

function triangulate(points: Point[]): Triangle[] {
  if (points.length < 3) return [];
  const remaining = points.map((point) => ({ ...point }));
  const winding = Math.sign(area(remaining)) || 1;
  const output: Triangle[] = [];
  const inside = (point: Point, a: Point, b: Point, c: Point) => {
    const one = signedArea(a, b, point) * winding;
    const two = signedArea(b, c, point) * winding;
    const three = signedArea(c, a, point) * winding;
    return one >= -0.000001 && two >= -0.000001 && three >= -0.000001;
  };
  while (remaining.length > 3) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index - 1 + remaining.length) % remaining.length];
      const current = remaining[index];
      const next = remaining[(index + 1) % remaining.length];
      if (signedArea(previous, current, next) * winding <= 0.000001) continue;
      const contains = remaining.some((candidate, candidateIndex) => {
        if (
          candidateIndex === index ||
          candidateIndex === (index - 1 + remaining.length) % remaining.length ||
          candidateIndex === (index + 1) % remaining.length
        )
          return false;
        return inside(candidate, previous, current, next);
      });
      if (contains) continue;
      output.push([previous, current, next]);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) output.push([remaining[0], remaining[1], remaining[2]]);
  return output;
}

function segmentIntersectionPoint(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 0.000001) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  if (t <= 0.0001 || t >= 0.9999 || u <= 0.0001 || u >= 0.9999) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

function findBoundaryCrossing(points: Point[]) {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const adjacent =
        second === first + 1 || (first === 0 && second === points.length - 1);
      if (adjacent) continue;
      const point = segmentIntersectionPoint(
        points[first],
        points[(first + 1) % points.length],
        points[second],
        points[(second + 1) % points.length],
      );
      if (point) return { first, second, point };
    }
  }
  return null;
}

function collectCrossingLoop(
  points: Point[],
  fromEdge: number,
  toVertex: number,
  crossing: Point,
) {
  const loop: Point[] = [{ ...crossing }];
  for (
    let index = (fromEdge + 1) % points.length;
    ;
    index = (index + 1) % points.length
  ) {
    loop.push({ ...points[index] });
    if (index === toVertex) return loop;
  }
}

function triangulateFold(points: Point[]): FoldedTriangle[] {
  const crossing = findBoundaryCrossing(points);
  if (!crossing) {
    return triangulate(points).map((triangle) => ({ triangle, flip: 0, crease: null }));
  }

  const frontLoop = collectCrossingLoop(
    points,
    crossing.first,
    crossing.second,
    crossing.point,
  );
  const backLoop = collectCrossingLoop(
    points,
    crossing.second,
    crossing.first,
    crossing.point,
  );

  return [
    ...triangulate(frontLoop).map(
      (triangle): FoldedTriangle => ({ triangle, flip: 0, crease: crossing.point }),
    ),
    ...triangulate(backLoop).map(
      (triangle): FoldedTriangle => ({ triangle, flip: 1, crease: crossing.point }),
    ),
  ];
}

const EFFECT_INDEX: Record<EffectId, number> = {
  negative: 0,
  halftone: 1,
  duotone: 2,
  holographic: 3,
  solar: 4,
  cold: 5,
  gradient: 6,
  spectral: 7,
  chrome: 8,
  lattice: 9,
};

const VERTEX_SHADER = `
attribute float aEffect;
attribute float aFlip;
attribute float aCrease;
varying vec2 vScreenUv;
varying float vEffect;
varying float vFlip;
varying float vCrease;
void main() {
  vScreenUv = uv;
  vEffect = aEffect;
  vFlip = aFlip;
  vCrease = aCrease;
  gl_Position = vec4(position, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uCamera;
uniform float uTime;
uniform float uHue;
uniform float uGradientPosition[8];
uniform vec3 uGradientColor[8];
uniform float uGradientCount;
varying vec2 vScreenUv;
varying float vEffect;
varying float vFlip;
varying float vCrease;

float kfLuma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = .5;
  for (int i = 0; i < 4; i++) {
    value += noise2(p) * amplitude;
    p = p * 2.03 + vec2(9.1, 17.3);
    amplitude *= .5;
  }
  return value;
}
vec3 rotateHue(vec3 color, float angle) {
  const mat3 toYiq = mat3(.299,.596,.211,.587,-.274,-.523,.114,-.322,.312);
  const mat3 toRgb = mat3(1.,1.,1.,.956,-.272,-1.106,.621,-.647,1.703);
  vec3 yiq = color * toYiq;
  float chroma = length(yiq.yz);
  float phase = atan(yiq.z, yiq.y) + angle;
  yiq.yz = chroma * vec2(cos(phase), sin(phase));
  return clamp(yiq * toRgb, 0.0, 1.0);
}
vec3 mapGradient(float value) {
  vec3 color = uGradientColor[0];
  for (int i = 1; i < 8; i++) {
    if (float(i) < uGradientCount && value >= uGradientPosition[i - 1]) {
      float width = max(.0001, uGradientPosition[i] - uGradientPosition[i - 1]);
      float t = smoothstep(0.0, 1.0, (value - uGradientPosition[i - 1]) / width);
      color = mix(uGradientColor[i - 1], uGradientColor[i], t);
    }
  }
  return color;
}
vec3 holo(float v, vec2 uv) {
  float wave = .08 * sin(uv.x * 20.0 + uv.y * 13.0 - uTime * 1.4);
  v = clamp(v + wave, 0.0, 1.0);
  if (v < .3) return mix(vec3(.01,.12,.5), vec3(0.,.9,1.), v / .3);
  if (v < .62) return mix(vec3(0.,.9,1.), vec3(.62,.05,.95), (v - .3) / .32);
  return mix(vec3(.62,.05,.95), vec3(1.,.08,.55), (v - .62) / .38);
}
void main() {
  vec2 uv = vScreenUv;
  vec3 camera = texture2D(uCamera, vec2(1.0 - uv.x, uv.y)).rgb;
  float l = kfLuma(camera);
  vec3 color = camera;

  if (vEffect < .5) {
    color = rotateHue(1.0 - camera, uHue);
    color = clamp((color - .5) * 1.25 + .5, 0.0, 1.0);
  } else if (vEffect < 1.5) {
    vec2 grid = vec2(112.0, 82.0);
    vec2 cell = floor(uv * grid);
    vec2 local = fract(uv * grid) - .5;
    float radius = mix(.03, .47, pow(l, 1.2));
    float dotInk = 1.0 - smoothstep(radius - .03, radius + .03, length(local));
    color = mix(vec3(1.,.96,.86), vec3(.85,.025,.05), dotInk);
    color -= hash21(cell) * .04;
  } else if (vEffect < 2.5) {
    float ink = 1.0 - smoothstep(.25, .78, clamp((l - .35) * 2.1 + .5, 0.0, 1.0));
    color = mix(vec3(.97,.95,.85), vec3(.02,.19,.55), ink);
    color += (hash21(floor(uv * 320.0)) - .5) * .06;
  } else if (vEffect < 3.5) {
    color = holo(l, uv);
    color += .08 * sin(uv.x * 75.0 + uTime * 2.3);
  } else if (vEffect < 4.5) {
    float hot = clamp((l - .25) * 1.8 + .35, 0.0, 1.0);
    color = hot < .55
      ? mix(vec3(.03,0.,.01), vec3(.95,.07,.01), hot / .55)
      : mix(vec3(.95,.07,.01), vec3(1.,.88,.3), (hot - .55) / .45);
  } else if (vEffect < 5.5) {
    float inv = 1.0 - clamp((l - .1) * 1.45, 0.0, 1.0);
    color = mix(vec3(.005,.02,.08), vec3(.02,.66,.78), smoothstep(.1,.78,inv));
    color = mix(color, vec3(.78,.95,1.), smoothstep(.84,1.,inv));
  } else if (vEffect < 6.5) {
    color = mapGradient(clamp((l - .06) * 1.18, 0.0, 1.0));
  } else if (vEffect < 7.5) {
    vec2 px = vec2(.004, .006);
    float edge = length(texture2D(uCamera, vec2(1.0 - uv.x + px.x, uv.y)).rgb -
                        texture2D(uCamera, vec2(1.0 - uv.x - px.x, uv.y)).rgb);
    float beam = exp(-pow(fract(uv.y * 1.2 - uTime * .13) - .5, 2.0) / .022);
    color = mix(vec3(.002,.012,.03), vec3(.015,.23,.34), l);
    color += vec3(.02,.7,.9) * edge * .8 + vec3(.01,.35,.55) * beam;
  } else if (vEffect < 8.5) {
    vec2 flowUv = uv * 3.4 + vec2(uTime * .05, -uTime * .035);
    float flow = fbm(flowUv + vec2(fbm(flowUv + 4.2), fbm(flowUv + 8.6)) * .8);
    float tone = clamp(l * .78 + flow * .35 + sin((uv.x + uv.y) * 15.0 + uTime) * .08, 0.0, 1.0);
    color = mix(vec3(.004,.01,.055), vec3(.02,.72,.9), smoothstep(.05,.42,tone));
    color = mix(color, vec3(.48,.03,.82), smoothstep(.42,.72,tone));
    color = mix(color, vec3(.82,.98,1.), smoothstep(.78,1.,tone));
  } else {
    float gx = 1.0 - smoothstep(.44,.5,abs(fract(uv.x * 25.0) - .5));
    float gy = 1.0 - smoothstep(.44,.5,abs(fract(uv.y * 17.0) - .5));
    float contour = 1.0 - smoothstep(.02,.09,abs(fract(l * 8.0 + uTime * .08) - .5));
    float scan = exp(-pow(fract(uv.y * 1.25 - uTime * .1) - .5,2.0) / .03);
    color = mix(vec3(.008,.004,.035), vec3(.12,.015,.25), l);
    color += vec3(.02,.62,.88) * contour * .6;
    color += vec3(.24,.04,.5) * max(gx,gy) * .24;
    color += vec3(.04,.35,.7) * scan;
  }
  if (vFlip > .5) {
    float backLuma = kfLuma(color);
    vec3 backTint = mix(vec3(.025,.045,.09), vec3(.36,.5,.68), backLuma);
    color = mix(color, backTint, .52);
    color *= .82;
  }
  float creaseLight = pow(clamp(vCrease, 0.0, 1.0), 4.0);
  color += vec3(.48,.72,1.0) * creaseLight * .28;
  color += vec3(1.0,.42,.16) * creaseLight * vFlip * .12;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), .96);
}`;

class StageRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private texture: THREE.VideoTexture;
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private faceCount = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        uCamera: { value: this.texture },
        uTime: { value: 0 },
        uHue: { value: 0 },
        uGradientPosition: { value: new Float32Array(8) },
        uGradientColor: { value: Array.from({ length: 8 }, () => new THREE.Color("#000")) },
        uGradientCount: { value: 2 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.scene.add(this.mesh);
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
  }

  setHue(degrees: number) {
    this.material.uniforms.uHue.value = (degrees * Math.PI) / 180;
  }

  setGradient(stops: GradientStop[]) {
    const ordered = [...stops].sort((a, b) => a.position - b.position).slice(0, 8);
    const positions = this.material.uniforms.uGradientPosition.value as Float32Array;
    const colors = this.material.uniforms.uGradientColor.value as THREE.Color[];
    ordered.forEach((stop, index) => {
      positions[index] = stop.position;
      colors[index].set(stop.color);
    });
    for (let index = ordered.length; index < 8; index += 1) {
      positions[index] = 1;
      colors[index].copy(colors[Math.max(0, ordered.length - 1)]);
    }
    this.material.uniforms.uGradientCount.value = ordered.length;
  }

  render(vertices: Vertex[], regions: Region[], now: number) {
    const lookup = new Map(vertices.map((vertex) => [vertex.id, vertex.position]));
    const faces = regions.flatMap((region) =>
      triangulateFold(region.vertexIds.map((id) => lookup.get(id)!)).map((face) => ({
        ...face,
        effect: EFFECT_INDEX[region.effect],
      })),
    );
    if (this.faceCount !== faces.length) {
      this.faceCount = faces.length;
      const geometry = new THREE.BufferGeometry();
      const count = Math.max(0, faces.length * 3);
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      geometry.setAttribute("aEffect", new THREE.BufferAttribute(new Float32Array(count), 1));
      geometry.setAttribute("aFlip", new THREE.BufferAttribute(new Float32Array(count), 1));
      geometry.setAttribute("aCrease", new THREE.BufferAttribute(new Float32Array(count), 1));
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
    }
    const position = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = this.mesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
    const effect = this.mesh.geometry.getAttribute("aEffect") as THREE.BufferAttribute;
    const flip = this.mesh.geometry.getAttribute("aFlip") as THREE.BufferAttribute;
    const crease = this.mesh.geometry.getAttribute("aCrease") as THREE.BufferAttribute;
    let cursor = 0;
    faces.forEach((face) => {
      face.triangle.forEach((point) => {
        position.setXYZ(cursor, point.x * 2 - 1, 1 - point.y * 2, 0);
        uv.setXY(cursor, face.flip ? 1 - point.x : point.x, 1 - point.y);
        effect.setX(cursor, face.effect);
        flip.setX(cursor, face.flip);
        const creaseDistance = face.crease
          ? Math.hypot(point.x - face.crease.x, point.y - face.crease.y)
          : 1;
        crease.setX(cursor, face.crease ? Math.max(0, 1 - creaseDistance * 5.5) : 0);
        cursor += 1;
      });
    });
    position.needsUpdate = true;
    uv.needsUpdate = true;
    effect.needsUpdate = true;
    flip.needsUpdate = true;
    crease.needsUpdate = true;
    this.material.uniforms.uTime.value = now * 0.001;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.renderer.dispose();
  }
}

function getMediaPoint(
  point: { x: number; y: number },
  video: HTMLVideoElement,
  stage: HTMLElement,
): Point {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;
  return {
    x: (offsetX + (1 - point.x) * drawnWidth) / width,
    y: (offsetY + point.y * drawnHeight) / height,
  };
}

function regionLabel(index: number) {
  return String.fromCharCode(65 + index);
}

export default function GestureStage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<StageRenderer | null>(null);
  const handTrackerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const verticesRef = useRef<Vertex[]>(makePolygon());
  const chordsRef = useRef<Chord[]>([]);
  const regionEffectsRef = useRef(new Map<string, EffectId>([["whole", "holographic"]]));
  const regionsRef = useRef<Region[]>(deriveRegions(verticesRef.current, [], regionEffectsRef.current));
  const bindingCandidateRef = useRef<{ vertexId: string; key: string; frames: number } | null>(null);
  const smoothTargetsRef = useRef(new Map<string, Point>());
  const lastVideoTimeRef = useRef(-1);
  const dragVertexRef = useRef<string | null>(null);
  const bindingModeRef = useRef(false);

  const [revision, setRevision] = useState(0);
  const [studioState, setStudioState] = useState<StudioState>("idle");
  const [message, setMessage] = useState("先启用摄像头，再编辑你的动态形状");
  const [busy, setBusy] = useState(false);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [selectedRegionId, setSelectedRegionId] = useState("whole");
  const [connectMode, setConnectMode] = useState(false);
  const [connectStart, setConnectStart] = useState<string | null>(null);
  const [presentMode, setPresentMode] = useState(false);
  const [sidebarsHidden, setSidebarsHidden] = useState(false);
  const [hue, setHue] = useState(18);
  const [gradientStops, setGradientStops] = useState<GradientStop[]>(DEFAULT_STOPS);
  const [selectedStop, setSelectedStop] = useState(2);

  const vertices = verticesRef.current;
  const chords = chordsRef.current;
  const regions = regionsRef.current;
  const selectedRegion =
    regions.find((region) => region.id === selectedRegionId) ?? regions[0];

  const refresh = useCallback(() => {
    regionsRef.current = deriveRegions(
      verticesRef.current,
      chordsRef.current,
      regionEffectsRef.current,
    );
    const knownIds = new Set(regionsRef.current.map((region) => region.id));
    regionEffectsRef.current.forEach((_, id) => {
      if (id !== "whole" && !knownIds.has(id)) regionEffectsRef.current.delete(id);
    });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    void revision;
    rendererRef.current?.setHue(hue);
  }, [hue, revision]);

  useEffect(() => {
    rendererRef.current?.setGradient(gradientStops);
  }, [gradientStops]);

  useEffect(() => {
    bindingModeRef.current = studioState === "binding";
  }, [studioState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const renderer = new StageRenderer(canvas, video);
    renderer.setHue(hue);
    renderer.setGradient(gradientStops);
    rendererRef.current = renderer;
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    const resizeObserver = new ResizeObserver(onResize);
    if (stageRef.current) resizeObserver.observe(stageRef.current);

    const tick = (now: number) => {
      renderer.render(verticesRef.current, regionsRef.current, now);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      handTrackerRef.current?.close();
    };
  }, []);

  const updateRegionsAfterEffect = (regionId: string, effect: EffectId) => {
    regionEffectsRef.current.set(regionId, effect);
    regionsRef.current = regionsRef.current.map((region) =>
      region.id === regionId ? { ...region, effect } : region,
    );
    setRevision((value) => value + 1);
  };

  const processHands = useCallback(
    (now: number) => {
      const tracker = handTrackerRef.current;
      const video = videoRef.current;
      const stage = stageRef.current;
      if (!tracker || !video || !stage || video.readyState < 2) return;
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;
      const result = tracker.detectForVideo(video, now);
      const hands = result.landmarks.map((landmarks, index) => ({
        side: (result.handedness[index]?.[0]?.categoryName === "Left" ? "Left" : "Right") as HandSide,
        landmarks: landmarks.map((point) => getMediaPoint(point, video, stage)),
      }));

      let changed = false;
      let lostCount = 0;
      verticesRef.current.forEach((vertex) => {
        if (!vertex.binding) return;
        const hand = hands.find((candidate) => candidate.side === vertex.binding!.hand);
        const point = hand?.landmarks[vertex.binding.landmark];
        if (!point) {
          if (vertex.lostAt === null) vertex.lostAt = now;
          if (now - vertex.lostAt > 300) {
            vertex.bindingState = "lost";
            lostCount += 1;
          }
          return;
        }
        vertex.lostAt = null;
        vertex.bindingState = "bound";
        const prior = smoothTargetsRef.current.get(vertex.id) ?? vertex.position;
        const distance = Math.hypot(point.x - prior.x, point.y - prior.y);
        const alpha = distance > 0.08 ? 0.68 : distance > 0.025 ? 0.44 : 0.24;
        const next = {
          x: prior.x + (point.x - prior.x) * alpha,
          y: prior.y + (point.y - prior.y) * alpha,
        };
        smoothTargetsRef.current.set(vertex.id, next);
        vertex.position = next;
        changed = true;
      });

      if (bindingModeRef.current) {
        const used = new Set(
          verticesRef.current.flatMap((vertex) =>
            vertex.binding ? [`${vertex.binding.hand}:${vertex.binding.landmark}`] : [],
          ),
        );
        let nearest:
          | {
              vertex: Vertex;
              hand: (typeof hands)[number];
              finger: (typeof FINGERS)[number];
              distance: number;
            }
          | undefined;
        verticesRef.current
          .filter((vertex) => !vertex.binding)
          .forEach((vertex) => {
            hands.forEach((hand) => {
              FINGERS.forEach((finger) => {
                const key = `${hand.side}:${finger.landmark}`;
                if (used.has(key)) return;
                const point = hand.landmarks[finger.landmark];
                const distance = Math.hypot(
                  (vertex.position.x - point.x) * stage.clientWidth,
                  (vertex.position.y - point.y) * stage.clientHeight,
                );
                if (distance < 48 && (!nearest || distance < nearest.distance)) {
                  nearest = { vertex, hand, finger, distance };
                }
              });
            });
          });
        if (nearest) {
          const target = nearest as {
            vertex: Vertex;
            hand: (typeof hands)[number];
            finger: (typeof FINGERS)[number];
            distance: number;
          };
          const key = `${target.hand.side}:${target.finger.landmark}`;
          const candidate = bindingCandidateRef.current;
          if (!candidate || candidate.vertexId !== target.vertex.id || candidate.key !== key) {
            verticesRef.current.forEach((vertex) => {
              if (!vertex.binding && vertex.bindingState === "candidate") vertex.bindingState = "idle";
            });
            bindingCandidateRef.current = { vertexId: target.vertex.id, key, frames: 1 };
            target.vertex.bindingState = "candidate";
          } else {
            candidate.frames += 1;
            if (candidate.frames >= 8) {
              target.vertex.binding = {
                hand: target.hand.side,
                landmark: target.finger.landmark,
                finger: target.finger.name,
              };
              target.vertex.bindingState = "bound";
              bindingCandidateRef.current = null;
              changed = true;
            }
          }
        } else if (bindingCandidateRef.current) {
          const candidateVertex = verticesRef.current.find(
            (vertex) => vertex.id === bindingCandidateRef.current?.vertexId,
          );
          if (candidateVertex && !candidateVertex.binding) candidateVertex.bindingState = "idle";
          bindingCandidateRef.current = null;
        }
        if (verticesRef.current.every((vertex) => vertex.binding)) {
          setStudioState("tracking");
          setMessage("绑定完成 · 现在移动手指即可控制形状");
        }
      }

      if (changed) {
        regionsRef.current = deriveRegions(
          verticesRef.current,
          chordsRef.current,
          regionEffectsRef.current,
        );
        if (Math.round(now / 90) % 2 === 0) setRevision((value) => value + 1);
      }
      if (lostCount > 0 && studioState === "tracking") setStudioState("partial");
      if (lostCount === 0 && studioState === "partial") setStudioState("tracking");
    },
    [studioState],
  );

  useEffect(() => {
    let frame = 0;
    const loop = (now: number) => {
      if (studioState !== "idle") processHands(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [processHands, studioState]);

  const startCamera = async () => {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    setMessage("正在加载手势模型与摄像头…");
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
      );
      handTrackerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.62,
        minHandPresenceConfidence: 0.62,
        minTrackingConfidence: 0.64,
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setStudioState("ready");
      setMessage("摄像头已连接 · 调整形状后开始绑定");
    } catch (error) {
      console.error(error);
      setStudioState("idle");
      setMessage("无法连接摄像头，请检查浏览器权限后重试");
    } finally {
      setBusy(false);
    }
  };

  const resetShape = (count = verticesRef.current.length) => {
    verticesRef.current = makePolygon(count);
    chordsRef.current = [];
    regionEffectsRef.current = new Map([["whole", "holographic"]]);
    regionsRef.current = deriveRegions(verticesRef.current, [], regionEffectsRef.current);
    setSelectedRegionId("whole");
    setConnectMode(false);
    setConnectStart(null);
    smoothTargetsRef.current.clear();
    if (studioState !== "idle") setStudioState("ready");
    refresh();
  };

  const changeSides = (delta: number) => {
    const next = Math.max(3, Math.min(8, verticesRef.current.length + delta));
    if (next !== verticesRef.current.length) resetShape(next);
  };

  const clearBindings = () => {
    verticesRef.current.forEach((vertex) => {
      vertex.binding = null;
      vertex.bindingState = "idle";
      vertex.lostAt = null;
    });
    smoothTargetsRef.current.clear();
    if (studioState !== "idle") setStudioState("ready");
    setMessage("绑定已清除 · 可以重新调整形状");
    refresh();
  };

  const beginBinding = () => {
    if (studioState === "idle") {
      setMessage("请先启用摄像头");
      return;
    }
    setStudioState("binding");
    setConnectMode(false);
    setConnectStart(null);
    bindingCandidateRef.current = null;
    setMessage("把不同指尖依次停在闪烁控制点上");
  };

  const pointerPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0.01, Math.min(0.99, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0.01, Math.min(0.99, (event.clientY - rect.top) / rect.height)),
    };
  };

  const onVertexDown = (event: React.PointerEvent<SVGGElement>, vertex: Vertex) => {
    event.stopPropagation();
    if (connectMode) {
      if (!connectStart) {
        setConnectStart(vertex.id);
        setMessage(`已选择 ${vertex.id} · 再选一个不相邻控制点`);
        return;
      }
      if (connectStart === vertex.id) {
        setConnectStart(null);
        return;
      }
      const indexA = verticesRef.current.findIndex((item) => item.id === connectStart);
      const indexB = verticesRef.current.findIndex((item) => item.id === vertex.id);
      const adjacent =
        Math.abs(indexA - indexB) === 1 ||
        Math.abs(indexA - indexB) === verticesRef.current.length - 1;
      const exists = chordsRef.current.some(
        (chord) =>
          (chord.a === connectStart && chord.b === vertex.id) ||
          (chord.b === connectStart && chord.a === vertex.id),
      );
      const newA = verticesRef.current[indexA].position;
      const newB = verticesRef.current[indexB].position;
      const crosses = chordsRef.current.some((chord) => {
        if ([chord.a, chord.b].includes(connectStart) || [chord.a, chord.b].includes(vertex.id))
          return false;
        const a = verticesRef.current.find((item) => item.id === chord.a)!.position;
        const b = verticesRef.current.find((item) => item.id === chord.b)!.position;
        return segmentCrosses(newA, newB, a, b);
      });
      if (!adjacent && !exists && !crosses) {
        chordsRef.current = [
          ...chordsRef.current,
          { id: `C${Date.now()}`, a: connectStart, b: vertex.id },
        ];
        regionsRef.current = deriveRegions(
          verticesRef.current,
          chordsRef.current,
          regionEffectsRef.current,
        );
        setSelectedRegionId(regionsRef.current[0]?.id ?? "whole");
        setMessage("分区已创建 · 点击不同区域设置独立滤镜");
        refresh();
      } else {
        setMessage("这两个点不能连接，请选择不相邻且不交叉的点");
      }
      setConnectStart(null);
      return;
    }
    if (studioState === "binding" || studioState === "tracking" || vertex.binding) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragVertexRef.current = vertex.id;
  };

  const onVertexMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragVertexRef.current) return;
    const vertex = verticesRef.current.find((item) => item.id === dragVertexRef.current);
    if (!vertex) return;
    vertex.position = pointerPoint(event);
    regionsRef.current = deriveRegions(
      verticesRef.current,
      chordsRef.current,
      regionEffectsRef.current,
    );
    setRevision((value) => value + 1);
  };

  const endDrag = () => {
    dragVertexRef.current = null;
  };

  const clearPartitions = () => {
    chordsRef.current = [];
    const firstEffect = selectedRegion?.effect ?? "holographic";
    regionEffectsRef.current = new Map([["whole", firstEffect]]);
    regionsRef.current = deriveRegions(verticesRef.current, [], regionEffectsRef.current);
    setSelectedRegionId("whole");
    setConnectStart(null);
    setConnectMode(false);
    setMessage("所有分区已清除");
    refresh();
  };

  const enterPresent = async () => {
    setPresentMode(true);
    setMessage("纯净展示模式");
    try {
      await stageRef.current?.requestFullscreen?.();
    } catch {
      // Fullscreen is optional; the clean layout still works without it.
    }
  };

  useEffect(() => {
    const onFullscreen = () => {
      if (!document.fullscreenElement && presentMode) setPresentMode(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, [presentMode]);

  const aspectStyle = useMemo(
    () => ({
      aspectRatio: aspect === "16:9" ? "16 / 9" : aspect === "9:16" ? "9 / 16" : "1 / 1",
    }),
    [aspect],
  );

  const boundCount = vertices.filter((vertex) => vertex.binding).length;
  const activeStop = gradientStops[selectedStop] ?? gradientStops[0];

  return (
    <main
      className={`studio-shell ${presentMode ? "is-presenting" : ""} ${
        sidebarsHidden ? "sidebars-hidden" : ""
      }`}
    >
      <header className="studio-header">
        <div className="brand-lockup">
          <span className="brand-mark brand-mark-a9">AL</span>
          <div>
            <strong>手势交互实验室</strong>
            <small>ALEX · GESTURE INTERACTION</small>
          </div>
        </div>
        <nav className="experience-switch" aria-label="互动玩法">
          <Link className="active" href="/">
            矢量折叠
          </Link>
          <Link href="/particles">粒子场</Link>
        </nav>
        <div className="header-status">
          <span className={`status-light state-${studioState}`} />
          <span>{message}</span>
        </div>
        <div className="header-actions">
          <button
            className="rail-toggle"
            aria-pressed={sidebarsHidden}
            onClick={() => setSidebarsHidden((value) => !value)}
          >
            {sidebarsHidden ? "显示边栏" : "隐藏边栏"}
          </button>
          <button className="present-button" onClick={enterPresent} disabled={studioState === "idle"}>
            全屏录制
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-rail">
          <section className="panel-block session-block">
            <div className="panel-kicker">01 / 输入</div>
            <h2>摄像头</h2>
            <p>使用浏览器本地识别双手，画面不会上传到本站。</p>
            <button className="primary-action" onClick={startCamera} disabled={busy || studioState !== "idle"}>
              {busy ? "正在连接…" : studioState === "idle" ? "启用摄像头" : "摄像头已连接"}
            </button>
            <div className="aspect-switch" aria-label="画面比例">
              {(["16:9", "9:16", "1:1"] as Aspect[]).map((item) => (
                <button
                  key={item}
                  className={aspect === item ? "active" : ""}
                  onClick={() => setAspect(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="panel-block shape-block">
            <div className="panel-kicker">02 / 形状</div>
            <div className="panel-title-row">
              <h2>{vertices.length} 边形</h2>
              <span>{regions.length} 个区域</span>
            </div>
            <div className="stepper">
              <button onClick={() => changeSides(-1)} disabled={vertices.length <= 3 || studioState === "tracking"}>
                −
              </button>
              <strong>{vertices.length}</strong>
              <button onClick={() => changeSides(1)} disabled={vertices.length >= 8 || studioState === "tracking"}>
                ＋
              </button>
            </div>
            <div className="control-grid">
              <button onClick={() => resetShape()}>重置形状</button>
              <button
                className={connectMode ? "active" : ""}
                onClick={() => {
                  setConnectMode((value) => !value);
                  setConnectStart(null);
                }}
                disabled={studioState === "tracking" || studioState === "binding"}
              >
                {connectMode ? "退出连线" : "创建分区"}
              </button>
              <button onClick={clearPartitions} disabled={!chords.length}>
                清除分区
              </button>
              <button onClick={clearBindings} disabled={!boundCount}>
                清除绑定
              </button>
            </div>
          </section>

          <section className="panel-block binding-block">
            <div className="panel-kicker">03 / 绑定</div>
            <div className="binding-meter">
              <strong>
                {boundCount}<span> / {vertices.length}</span>
              </strong>
              <div>
                <span style={{ width: `${(boundCount / vertices.length) * 100}%` }} />
              </div>
            </div>
            <button
              className="bind-action"
              onClick={beginBinding}
              disabled={studioState === "idle" || studioState === "binding"}
            >
              {boundCount ? "继续绑定指尖" : "开始绑定指尖"}
            </button>
            <small>每个顶点需要一个不同的指尖，停留约半秒即可锁定。</small>
          </section>
        </aside>

        <section className="stage-column">
          <div className="stage-frame" style={aspectStyle}>
            <div className="stage-viewport" ref={stageRef}>
              <video ref={videoRef} className="camera-feed" muted playsInline />
              <div className="stage-vignette" />
              <canvas ref={canvasRef} className="effect-canvas" />
              {!presentMode && studioState !== "tracking" && studioState !== "partial" && (
                <svg
                  className="interaction-layer"
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  onPointerMove={onVertexMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  {regions.map((region, index) => {
                    const points = region.vertexIds
                      .map((id) => {
                        const point = vertices.find((vertex) => vertex.id === id)!.position;
                        return `${point.x},${point.y}`;
                      })
                      .join(" ");
                    return (
                      <polygon
                        key={region.id}
                        points={points}
                        className={`region-hit ${selectedRegion?.id === region.id ? "selected" : ""}`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelectedRegionId(region.id);
                        }}
                      >
                        <title>{`区域 ${regionLabel(index)}`}</title>
                      </polygon>
                    );
                  })}
                  {chords.map((chord) => {
                    const a = vertices.find((vertex) => vertex.id === chord.a)!.position;
                    const b = vertices.find((vertex) => vertex.id === chord.b)!.position;
                    return (
                      <line
                        key={chord.id}
                        className="partition-line"
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                      />
                    );
                  })}
                  {vertices.map((vertex) => (
                    <g
                      key={vertex.id}
                      className={`control-point ${vertex.bindingState} ${
                        connectStart === vertex.id ? "connect-start" : ""
                      }`}
                      transform={`translate(${vertex.position.x} ${vertex.position.y})`}
                      onPointerDown={(event) => onVertexDown(event, vertex)}
                    >
                      <circle className="point-halo" r="0.035" />
                      <circle className="point-core" r="0.013" />
                    </g>
                  ))}
                </svg>
              )}
              {studioState === "idle" && (
                <div className="empty-stage">
                  <span>LIVE CANVAS</span>
                  <strong>让图形跟着你的手指动起来</strong>
                  <p>启用摄像头后，在画面里调整形状并绑定指尖。</p>
                </div>
              )}
              {presentMode && (
                <button
                  className="leave-present"
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen();
                    setPresentMode(false);
                  }}
                  aria-label="退出录制模式"
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
          </div>
          <div className="stage-caption">
            <span>提示</span>
            <p>
              {connectMode
                ? connectStart
                  ? "选择第二个控制点完成分区"
                  : "依次选择两个不相邻控制点"
                : studioState === "binding"
                  ? "把指尖对准闪烁控制点"
                  : "编辑模式下可直接拖动控制点"}
            </p>
          </div>
        </section>

        <aside className="effect-browser">
          <div className="effect-heading">
            <div>
              <div className="panel-kicker">04 / 视觉</div>
              <h2>区域滤镜</h2>
            </div>
            <span className="region-badge">
              {regionLabel(Math.max(0, regions.findIndex((region) => region.id === selectedRegion?.id)))}
            </span>
          </div>
          <div className="effect-list">
            {EFFECTS.map((effect) => (
              <button
                key={effect.id}
                className={selectedRegion?.effect === effect.id ? "selected" : ""}
                onClick={() => selectedRegion && updateRegionsAfterEffect(selectedRegion.id, effect.id)}
              >
                <span className="effect-swatch" style={{ background: effect.swatch }} />
                <span>
                  <strong>{effect.name}</strong>
                  <small>{effect.detail}</small>
                </span>
                <i>{selectedRegion?.effect === effect.id ? "●" : "○"}</i>
              </button>
            ))}
          </div>

          {selectedRegion?.effect === "negative" && (
            <section className="mini-editor">
              <div className="mini-editor-title">
                <strong>色相偏移</strong>
                <output>{hue}°</output>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={(event) => setHue(Number(event.target.value))}
              />
            </section>
          )}

          {selectedRegion?.effect === "gradient" && (
            <section className="mini-editor gradient-editor">
              <div className="mini-editor-title">
                <strong>亮度颜色映射</strong>
                <small>暗部 → 高光</small>
              </div>
              <div
                className="gradient-track"
                style={{
                  background: `linear-gradient(90deg,${gradientStops
                    .map((stop) => `${stop.color} ${stop.position * 100}%`)
                    .join(",")})`,
                }}
              >
                {gradientStops.map((stop, index) => (
                  <button
                    key={`${stop.position}-${index}`}
                    className={selectedStop === index ? "selected" : ""}
                    style={{ left: `${stop.position * 100}%`, background: stop.color }}
                    onClick={() => setSelectedStop(index)}
                    aria-label={`选择颜色节点 ${index + 1}`}
                  />
                ))}
              </div>
              <label className="color-control">
                <span>当前节点</span>
                <input
                  type="color"
                  value={activeStop.color}
                  onChange={(event) =>
                    setGradientStops((stops) =>
                      stops.map((stop, index) =>
                        index === selectedStop ? { ...stop, color: event.target.value } : stop,
                      ),
                    )
                  }
                />
              </label>
            </section>
          )}

          <div className="open-source-note">
            <strong>OPEN SOURCE READY</strong>
            <p>所有识别和渲染都在浏览器本地完成，适合录制、教学与二次开发。</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
