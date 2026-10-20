"use client";

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

type ShapeId = "sphere" | "heart" | "saturn" | "text";
type GestureName = "等待摄像头" | "未检测到手" | "张手 · 粒子展开" | "握拳 · 粒子聚合" | "捏合 · 切换形态" | "手掌移动 · 旋转";

const PARTICLE_COUNT = 12000;
const SHAPES: Array<{ id: ShapeId; label: string; mark: string }> = [
  { id: "sphere", label: "粒子球", mark: "01" },
  { id: "heart", label: "爱心", mark: "02" },
  { id: "saturn", label: "土星", mark: "03" },
  { id: "text", label: "文字", mark: "04" },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function pseudo(index: number, salt = 0) {
  const value = Math.sin(index * 91.173 + salt * 47.77) * 43758.5453;
  return value - Math.floor(value);
}

function spherePositions() {
  const data = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = Math.PI * (3 - Math.sqrt(5)) * i;
    const shell = 1.72 + pseudo(i, 2) * 0.25;
    data[i * 3] = Math.cos(theta) * radius * shell;
    data[i * 3 + 1] = y * shell;
    data[i * 3 + 2] = Math.sin(theta) * radius * shell;
  }
  return data;
}

function heartPositions() {
  const data = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const t = pseudo(i, 4) * Math.PI * 2;
    const depth = Math.sqrt(pseudo(i, 8));
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    data[i * 3] = x * 0.112 * depth;
    data[i * 3 + 1] = (y * 0.112 - 0.18) * depth;
    data[i * 3 + 2] = (pseudo(i, 9) - 0.5) * 0.62 * (1.1 - depth * 0.35);
  }
  return data;
}

function saturnPositions() {
  const data = new Float32Array(PARTICLE_COUNT * 3);
  const planetCount = Math.floor(PARTICLE_COUNT * 0.58);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    if (i < planetCount) {
      const y = 1 - (i / Math.max(1, planetCount - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = Math.PI * (3 - Math.sqrt(5)) * i;
      const shell = 1.14 + pseudo(i, 12) * 0.18;
      data[i * 3] = Math.cos(theta) * radius * shell;
      data[i * 3 + 1] = y * shell;
      data[i * 3 + 2] = Math.sin(theta) * radius * shell;
    } else {
      const ringIndex = i - planetCount;
      const angle = pseudo(ringIndex, 14) * Math.PI * 2;
      const radius = 1.55 + pseudo(ringIndex, 15) * 1.15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const thickness = (pseudo(ringIndex, 16) - 0.5) * 0.12;
      data[i * 3] = x;
      data[i * 3 + 1] = thickness * 0.78 - z * 0.2;
      data[i * 3 + 2] = z * 0.98 + thickness;
    }
  }
  return data;
}

function textPositions(text: string) {
  const data = new Float32Array(PARTICLE_COUNT * 3);
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 360;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return spherePositions();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "white";
  const safeText = (text.trim() || "ALEX").slice(0, 8);
  const fontSize = safeText.length > 5 ? 160 : safeText.length > 2 ? 205 : 245;
  context.font = `900 ${fontSize}px Arial, "PingFang SC", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(safeText, canvas.width / 2, canvas.height / 2);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const candidates: Array<[number, number]> = [];
  for (let y = 3; y < canvas.height; y += 4) {
    for (let x = 3; x < canvas.width; x += 4) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 90) candidates.push([x, y]);
    }
  }
  if (!candidates.length) return spherePositions();
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const point = candidates[Math.floor(pseudo(i, 22) * candidates.length)];
    data[i * 3] = (point[0] / canvas.width - 0.5) * 6.6 + (pseudo(i, 23) - 0.5) * 0.025;
    data[i * 3 + 1] = (0.5 - point[1] / canvas.height) * 2.5 + (pseudo(i, 24) - 0.5) * 0.025;
    data[i * 3 + 2] = (pseudo(i, 25) - 0.5) * 0.24;
  }
  return data;
}

function makeTargets(shape: ShapeId, text: string) {
  if (shape === "heart") return heartPositions();
  if (shape === "saturn") return saturnPositions();
  if (shape === "text") return textPositions(text);
  return spherePositions();
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function extendedFingerCount(points: Array<{ x: number; y: number }>) {
  const wrist = points[0];
  return [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].filter(([tip, pip]) => distance(points[tip], wrist) > distance(points[pip], wrist) * 1.14).length;
}

export default function ParticleLab() {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const groupRef = useRef<THREE.Points | null>(null);
  const targetsRef = useRef<Float32Array>(spherePositions());
  const velocityRef = useRef(new Float32Array(PARTICLE_COUNT * 3));
  const scatterRef = useRef<Float32Array | null>(null);
  const shapeRef = useRef<ShapeId>("sphere");
  const spreadTargetRef = useRef(0);
  const spreadRef = useRef(0);
  const rotationTargetRef = useRef({ x: 0.06, y: 0 });
  const scaleTargetRef = useRef(1);
  const pinchRef = useRef(false);
  const lastPinchRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const pointerRef = useRef({ down: false, x: 0, y: 0 });
  const wordRef = useRef("ALEX");
  const [shape, setShape] = useState<ShapeId>("sphere");
  const [word, setWord] = useState("ALEX");
  const [gesture, setGesture] = useState<GestureName>("等待摄像头");
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [presentMode, setPresentMode] = useState(false);
  const [sidebarsHidden, setSidebarsHidden] = useState(false);

  const selectShape = useCallback((next: ShapeId) => {
    shapeRef.current = next;
    setShape(next);
    targetsRef.current = makeTargets(next, wordRef.current);
  }, []);

  const cycleShape = useCallback(() => {
    const current = SHAPES.findIndex((item) => item.id === shapeRef.current);
    selectShape(SHAPES[(current + 1) % SHAPES.length].id);
  }, [selectShape]);

  useEffect(() => {
    const scatter = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const phi = pseudo(i, 30) * Math.PI * 2;
      const cosTheta = pseudo(i, 31) * 2 - 1;
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const force = 1.7 + pseudo(i, 32) * 3.4;
      scatter[i * 3] = Math.cos(phi) * sinTheta * force;
      scatter[i * 3 + 1] = cosTheta * force;
      scatter[i * 3 + 2] = Math.sin(phi) * sinTheta * force;
    }
    scatterRef.current = scatter;
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    camera.position.z = 7.3;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setClearColor(0x050608, 1);
    mount.appendChild(renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    const initial = spherePositions();
    const positions = new Float32Array(initial);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const color = new THREE.Color();
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      color.setHSL(0.47 + pseudo(i, 40) * 0.19, 0.9, 0.55 + pseudo(i, 41) * 0.18);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometryRef.current = geometry;
    targetsRef.current = initial;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: `
        attribute vec3 aColor;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(18.0 / -mvPosition.z, 1.35, 4.8) * uPixelRatio;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) discard;
          float glow = smoothstep(0.5, 0.04, d);
          gl_FragColor = vec4(vColor * (1.05 + glow * 0.75), glow * 0.92);
        }
      `,
    });
    const points = new THREE.Points(geometry, material);
    groupRef.current = points;
    scene.add(points);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let frame = 0;
    let active = true;
    const animate = (time: number) => {
      if (!active) return;
      frame = requestAnimationFrame(animate);
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      const current = attribute.array as Float32Array;
      const targets = targetsRef.current;
      const velocities = velocityRef.current;
      const scatterData = scatterRef.current;
      spreadRef.current += (spreadTargetRef.current - spreadRef.current) * 0.075;
      const spread = spreadRef.current;
      const spring = spreadTargetRef.current < 0.1 ? 0.046 : 0.026;
      for (let i = 0; i < current.length; i += 3) {
        const drift = Math.sin(time * 0.0012 + i * 0.017) * 0.012;
        const desiredX = targets[i] + (scatterData?.[i] ?? 0) * spread + drift;
        const desiredY = targets[i + 1] + (scatterData?.[i + 1] ?? 0) * spread;
        const desiredZ = targets[i + 2] + (scatterData?.[i + 2] ?? 0) * spread;
        velocities[i] = (velocities[i] + (desiredX - current[i]) * spring) * 0.87;
        velocities[i + 1] = (velocities[i + 1] + (desiredY - current[i + 1]) * spring) * 0.87;
        velocities[i + 2] = (velocities[i + 2] + (desiredZ - current[i + 2]) * spring) * 0.87;
        current[i] += velocities[i];
        current[i + 1] += velocities[i + 1];
        current[i + 2] += velocities[i + 2];
      }
      attribute.needsUpdate = true;
      points.rotation.x += (rotationTargetRef.current.x - points.rotation.x) * 0.055;
      points.rotation.y += (rotationTargetRef.current.y - points.rotation.y) * 0.055;
      const targetScale = scaleTargetRef.current;
      points.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.06);
      if (!cameraReady) points.rotation.y += 0.0018;

      const tracker = trackerRef.current;
      const video = videoRef.current;
      if (tracker && video && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const result = tracker.detectForVideo(video, performance.now());
        const hands = result.landmarks;
        if (!hands.length) {
          setGesture("未检测到手");
        } else {
          const hand = hands[0];
          const fingers = extendedFingerCount(hand);
          const palmSize = Math.max(distance(hand[5], hand[17]), 0.04);
          const pinching = distance(hand[4], hand[8]) / palmSize < 0.43;
          rotationTargetRef.current = {
            x: clamp((hand[9].y - 0.5) * 1.25, -0.62, 0.62),
            y: clamp((0.5 - hand[9].x) * 1.8, -0.9, 0.9),
          };
          if (hands.length > 1) {
            scaleTargetRef.current = clamp(distance(hands[0][9], hands[1][9]) * 2.2, 0.72, 1.48);
          } else {
            scaleTargetRef.current += (1 - scaleTargetRef.current) * 0.08;
          }
          if (pinching) {
            setGesture("捏合 · 切换形态");
            if (!pinchRef.current && time - lastPinchRef.current > 650) {
              lastPinchRef.current = time;
              cycleShape();
            }
          } else if (fingers >= 4) {
            spreadTargetRef.current = 1;
            setGesture("张手 · 粒子展开");
          } else if (fingers <= 1) {
            spreadTargetRef.current = 0;
            setGesture("握拳 · 粒子聚合");
          } else {
            setGesture("手掌移动 · 旋转");
          }
          pinchRef.current = pinching;
        }
      }
      renderer.render(scene, camera);
    };
    animate(0);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      geometryRef.current = null;
      groupRef.current = null;
    };
  }, [cameraReady, cycleShape]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      trackerRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const onFullscreen = () => setPresentMode(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const startCamera = async () => {
    setBusy(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
      );
      trackerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minTrackingConfidence: 0.52,
      });
      setCameraReady(true);
      setGesture("未检测到手");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法打开摄像头");
      setGesture("等待摄像头");
    } finally {
      setBusy(false);
    }
  };

  const enterPresent = async () => {
    await document.documentElement.requestFullscreen?.();
    setPresentMode(true);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerRef.current = { down: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerRef.current.down) return;
    const dx = event.clientX - pointerRef.current.x;
    const dy = event.clientY - pointerRef.current.y;
    rotationTargetRef.current.y += dx * 0.006;
    rotationTargetRef.current.x = clamp(rotationTargetRef.current.x + dy * 0.006, -1.2, 1.2);
    pointerRef.current = { down: true, x: event.clientX, y: event.clientY };
  };

  return (
    <main
      className={`particle-shell ${presentMode ? "particle-presenting" : ""} ${
        sidebarsHidden ? "particle-rails-hidden" : ""
      }`}
    >
      <header className="particle-header">
        <div className="brand-lockup particle-brand">
          <span className="brand-mark brand-mark-a9">AL</span>
          <div>
            <strong>手势交互实验室</strong>
            <small>ALEX · PARTICLE FIELD</small>
          </div>
        </div>
        <nav className="experience-switch dark" aria-label="互动玩法">
          <Link href="/">矢量折叠</Link>
          <Link className="active" href="/particles">粒子场</Link>
        </nav>
        <div className="particle-status">
          <span className={cameraReady ? "live" : ""} />
          {gesture}
        </div>
        <div className="particle-header-actions">
          <button
            className="particle-rail-toggle"
            aria-pressed={sidebarsHidden}
            onClick={() => setSidebarsHidden((value) => !value)}
          >
            {sidebarsHidden ? "显示边栏" : "隐藏边栏"}
          </button>
          <button className="particle-present" onClick={enterPresent}>全屏录制</button>
        </div>
      </header>

      <section className="particle-workspace">
        <aside className="particle-controls">
          <div className="particle-index">PLAYGROUND / 02</div>
          <h1>手势<br />粒子场</h1>
          <p className="particle-lead">把双手变成控制器，让粒子在四种形态之间聚合、爆发与旋转。</p>

          <button className="camera-action" onClick={startCamera} disabled={busy || cameraReady}>
            {busy ? "正在加载识别模型…" : cameraReady ? "摄像头已连接" : "启用手势控制"}
          </button>
          {error && <p className="particle-error">{error}</p>}

          <div className="gesture-guide">
            <div><b>张开手</b><span>向外爆发</span></div>
            <div><b>握拳</b><span>重新聚合</span></div>
            <div><b>拇指 + 食指</b><span>切换形态</span></div>
            <div><b>移动 / 双手</b><span>旋转 / 缩放</span></div>
          </div>
        </aside>

        <section
          className="particle-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { pointerRef.current.down = false; }}
          onPointerCancel={() => { pointerRef.current.down = false; }}
          onWheel={(event) => {
            scaleTargetRef.current = clamp(scaleTargetRef.current - event.deltaY * 0.0008, 0.65, 1.55);
          }}
        >
          <div className="particle-canvas" ref={mountRef} />
          <div className="particle-aura" />
          <div className="particle-corners" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="stage-readout">
            <span>12,000 PARTICLES</span>
            <strong>{SHAPES.find((item) => item.id === shape)?.label}</strong>
          </div>
          <video className="tracking-source" ref={videoRef} muted playsInline aria-hidden="true" />
          <button
            className="particle-exit"
            onClick={() => document.exitFullscreen?.()}
            aria-label="退出全屏"
          >
            ×
          </button>
        </section>

        <aside className="shape-panel">
          <div className="shape-panel-head">
            <span>形态库</span>
            <b>{String(SHAPES.findIndex((item) => item.id === shape) + 1).padStart(2, "0")} / 04</b>
          </div>
          <div className="shape-list">
            {SHAPES.map((item) => (
              <button
                key={item.id}
                className={shape === item.id ? "active" : ""}
                onClick={() => selectShape(item.id)}
              >
                <span>{item.mark}</span>
                <strong>{item.label}</strong>
                <i>↗</i>
              </button>
            ))}
          </div>
          <div className="text-maker">
            <label htmlFor="particle-word">自定义文字</label>
            <div>
              <input
                id="particle-word"
                value={word}
                maxLength={8}
                onChange={(event) => {
                  wordRef.current = event.target.value;
                  setWord(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") selectShape("text");
                }}
              />
              <button onClick={() => selectShape("text")}>生成</button>
            </div>
            <small>支持中英文，建议 1–8 个字符</small>
          </div>
          <div className="mouse-note">
            <b>没有摄像头？</b>
            <span>拖动画面旋转，滚轮缩放；形态按钮始终可用。</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
