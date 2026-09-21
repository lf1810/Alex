import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Audio,
  Html5Video,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {getCardSfxPreset, matchingSeamlessArollAsset, resolveCardSfxPresetId, supportsCardSfx} from "@ajiunotes/contracts";
import type {Clip, StyleProfile, Track} from "@ajiunotes/contracts";
import type {EditorInputProps} from "./types.js";

const value = (props: Record<string, unknown>, keys: string[], fallback: string): string => {
  for (const key of keys) {
    const current = props[key];
    if (typeof current === "string" && current.trim()) return current;
  }
  return fallback;
};

// Editable copy is allowed to be deliberately blank. This differs from tokens such as
// colors and animation presets, where an empty value must still fall back safely.
const editableValue = (props: Record<string, unknown>, keys: string[], fallback: string): string => {
  for (const key of keys) {
    const current = props[key];
    if (typeof current === "string") return current;
  }
  return fallback;
};

const color = (style: StyleProfile, key: string, fallback: string): string => {
  const token = style.tokens.colors[key];
  return typeof token === "string" ? token : fallback;
};

const boundedNumber = (source: unknown, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number(source);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
};

const hexRgba = (source: string, alpha: number): string => {
  const matched = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(source);
  if (!matched) return `rgba(56,217,255,${Math.max(0, Math.min(1, alpha))})`;
  return `rgba(${Number.parseInt(matched[1]!, 16)},${Number.parseInt(matched[2]!, 16)},${Number.parseInt(matched[3]!, 16)},${Math.max(0, Math.min(1, alpha))})`;
};

const fontFamilies: Record<string, string> = {
  // Keep the CJK face first. Safari's `-apple-system` and Chromium's
  // `BlinkMacSystemFont` can resolve the same Chinese copy to different glyph
  // metrics, which made a title fit in Player but wrap during render.
  system: "'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif",
  pingfang: "'PingFang SC', -apple-system, sans-serif",
  heiti: "'Heiti SC', 'PingFang SC', sans-serif",
  songti: "'Songti SC', 'STSong', serif",
  kaiti: "'Kaiti SC', 'STKaiti', serif",
  rounded: "'Hiragino Maru Gothic ProN', 'PingFang SC', sans-serif",
};

type TypographyRole = "eyebrow" | "title" | "detail" | "body";
const typographyStyle = (
  clip: Clip,
  role: TypographyRole,
  fallback: {fontSize: number; fontWeight: number; color: string},
): CSSProperties => ({
  color: value(clip.props, [`${role}Color`], fallback.color),
  fontSize: boundedNumber(clip.props[`${role}FontSize`], fallback.fontSize, 10, 4096),
  fontWeight: boundedNumber(clip.props[`${role}FontWeight`], fallback.fontWeight, 400, 900),
  fontFamily: fontFamilies[value(clip.props, [`${role}FontFamily`], "system")] ?? fontFamilies.system,
  fontSynthesis: "none",
  fontKerning: "none",
  fontVariantLigatures: "none",
});

type SurfaceStyle = "none" | "glass" | "tech-transparent" | "deep-solid" | "neon-outline" | "gradient-panel";
const surfaceAppearance = (
  clip: Clip,
  accent: string,
  options: {material?: boolean; radius?: number} = {},
): CSSProperties => {
  const mode = value(clip.props, ["surfaceStyle"], "glass") as SurfaceStyle;
  if (mode === "none") {
    return {
      boxSizing: "border-box",
      borderRadius: 0,
      border: "none",
      background: "transparent",
      backdropFilter: "none",
      WebkitBackdropFilter: "none",
      boxShadow: "none",
    };
  }
  const borderColor = value(clip.props, ["borderColor"], accent);
  const defaultOpacity = options.material
    ? ({glass: 18, "tech-transparent": 10, "deep-solid": 32, "neon-outline": 6, "gradient-panel": 16}[mode] ?? 18)
    : ({glass: 76, "tech-transparent": 58, "deep-solid": 94, "neon-outline": 42, "gradient-panel": 78}[mode] ?? 76);
  const opacity = boundedNumber(clip.props.surfaceOpacity, defaultOpacity, 0, 100) / 100;
  const gradientStrength = boundedNumber(clip.props.gradientStrength, 78, 0, 100) / 100;
  const blur = boundedNumber(clip.props.glassBlur, options.material ? 6 : 18, 0, 40);
  const direction = value(clip.props, ["gradientDirection"], "left-solid");
  const faded = opacity * (1 - gradientStrength);
  const startAlpha = direction === "right-solid" ? faded : opacity;
  const endAlpha = direction === "right-solid" ? opacity : direction === "uniform" ? opacity : faded;
  const gradient = (leftColor: string, rightColor: string) => direction === "uniform"
    ? leftColor
    : `linear-gradient(to right, ${leftColor} 0%, ${rightColor} 100%)`;
  const baseDark = gradient(`rgba(7,17,27,${startAlpha})`, `rgba(7,17,27,${endAlpha})`);
  const backgrounds: Record<SurfaceStyle, string> = {
    none: "transparent",
    glass: `linear-gradient(135deg,rgba(255,255,255,.12),transparent 34%),${baseDark}`,
    "tech-transparent": `linear-gradient(rgba(56,217,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(56,217,255,.055) 1px,transparent 1px),${gradient(`rgba(5,19,31,${startAlpha * .8})`, `rgba(5,19,31,${endAlpha * .8})`)}`,
    "deep-solid": gradient(`rgba(5,12,20,${Math.max(.45, startAlpha)})`, `rgba(5,12,20,${Math.max(.45, endAlpha)})`),
    "neon-outline": gradient(`rgba(5,13,22,${startAlpha * .65})`, `rgba(5,13,22,${endAlpha * .65})`),
    "gradient-panel": `${gradient(hexRgba(accent, startAlpha * .42), hexRgba(accent, endAlpha * .12))},${baseDark}`,
  };
  const shadows: Record<SurfaceStyle, string> = {
    none: "none",
    glass: `0 14px 36px rgba(0,0,0,.30),0 0 22px ${hexRgba(borderColor, .22)},inset 0 1px 0 rgba(255,255,255,.18)`,
    "tech-transparent": `0 0 20px ${hexRgba(borderColor, .18)},inset 0 0 24px ${hexRgba(borderColor, .07)}`,
    "deep-solid": "0 16px 38px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.06)",
    "neon-outline": `0 0 26px ${hexRgba(borderColor, .52)},inset 0 0 22px ${hexRgba(borderColor, .12)}`,
    "gradient-panel": `0 14px 34px rgba(0,0,0,.32),0 0 24px ${hexRgba(borderColor, .28)},inset 0 1px 0 rgba(255,255,255,.14)`,
  };
  return {
    boxSizing: "border-box",
    borderRadius: options.radius ?? 14,
    border: `${mode === "neon-outline" ? 2 : 1}px solid ${borderColor}`,
    background: backgrounds[mode] ?? backgrounds.glass,
    backgroundSize: mode === "tech-transparent" ? "28px 28px,28px 28px,100% 100%" : undefined,
    backdropFilter: mode === "glass" ? `blur(${blur}px) saturate(150%)` : mode === "tech-transparent" ? `blur(${Math.min(blur, 6)}px) saturate(125%)` : undefined,
    WebkitBackdropFilter: mode === "glass" ? `blur(${blur}px) saturate(150%)` : mode === "tech-transparent" ? `blur(${Math.min(blur, 6)}px) saturate(125%)` : undefined,
    boxShadow: shadows[mode] ?? shadows.glass,
  };
};

type MaterialEdgeFadeMode = "none" | "both" | "left" | "right";
const materialEdgeMask = (clip: Clip): string | undefined => {
  const mode = value(clip.props, ["edgeFadeMode"], "both") as MaterialEdgeFadeMode;
  if (mode === "none") return undefined;
  const width = boundedNumber(clip.props.edgeFadeWidth, 14, 0, 45);
  if (width <= 0) return undefined;
  if (mode === "left") return `linear-gradient(to right, transparent 0%, #000 ${width}%, #000 100%)`;
  if (mode === "right") return `linear-gradient(to right, #000 0%, #000 ${100 - width}%, transparent 100%)`;
  return `linear-gradient(to right, transparent 0%, #000 ${width}%, #000 ${100 - width}%, transparent 100%)`;
};

const motionStyle = (clip: Clip, style: StyleProfile): CSSProperties => {
  const frame = useCurrentFrame();
  const enter = Math.min(style.motion.defaultEnterFrames, Math.max(1, clip.durationInFrames));
  const exit = Math.min(style.motion.defaultExitFrames, Math.max(1, clip.durationInFrames));
  const enterProgress = interpolate(frame, [0, enter], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitProgress = interpolate(frame, [Math.max(0, clip.durationInFrames - exit), clip.durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progress = Math.min(enterProgress, exitProgress);
  const preset = value(clip.props, ["enterPreset"], "tech-slide-scale");
  const horizontal = preset.includes("right") ? 30 * (1 - progress) : 0;
  const vertical = preset.includes("up") ? 24 * (1 - progress) : 0;
  const scale = preset.includes("scale") || preset.includes("focus") ? 0.94 + progress * 0.06 : 1;
  const isMaterialTemplate = Boolean(clip.componentId?.endsWith("proof-frame") || clip.componentId?.endsWith("demo-focus"));
  const tiltY = clip.type === "template" && !isMaterialTemplate ? boundedNumber(clip.props.tiltY, 0, -45, 45) : 0;
  const tiltX = clip.type === "template" && !isMaterialTemplate ? boundedNumber(clip.props.tiltX, 0, -30, 30) : 0;
  return {
    opacity: progress * clip.transform.opacity,
    transform: `perspective(1400px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translate3d(${horizontal}px, ${vertical}px, 0) scale(${scale * clip.transform.scale}) rotate(${clip.transform.rotation}deg)`,
    transformOrigin: "center",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
  };
};

const smootherStep = (progress: number): number => {
  const bounded = Math.max(0, Math.min(1, progress));
  return bounded * bounded * bounded * (bounded * (bounded * 6 - 15) + 10);
};

const focusTransitionProgress = (clip: Clip, frame: number): number => {
  const transitionFrames = boundedNumber(clip.props.focusTransitionFrames, 24, 6, 45);
  const endFrame = Math.max(0, clip.durationInFrames - 1);
  const enter = interpolate(frame, [0, Math.min(endFrame, transitionFrames)], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const exit = interpolate(frame, [Math.max(0, endFrame - transitionFrames), endFrame], [1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return smootherStep(Math.min(enter, exit));
};

const AnimatedClipBox = ({clip, style, children, overflow = "hidden"}: {clip: Clip; style: StyleProfile; children: ReactNode; overflow?: CSSProperties["overflow"]}) => {
  const frame = useCurrentFrame();
  const animated = motionStyle(clip, style);
  const restore = clip.props.focusRestoreTransform;
  const focusRestore = clip.props.fullScreenFocus === true && restore && typeof restore === "object" && !Array.isArray(restore)
    ? restore as Record<string, unknown>
    : undefined;
  const focusProgress = focusRestore ? focusTransitionProgress(clip, frame) : 1;
  const restoreNumber = (key: "x" | "y" | "width" | "height" | "scale" | "rotation", fallback: number) => {
    const parsed = Number(focusRestore?.[key]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const left = focusRestore ? interpolate(focusProgress, [0, 1], [restoreNumber("x", clip.transform.x), clip.transform.x]) : clip.transform.x;
  const top = focusRestore ? interpolate(focusProgress, [0, 1], [restoreNumber("y", clip.transform.y), clip.transform.y]) : clip.transform.y;
  const width = focusRestore ? interpolate(focusProgress, [0, 1], [restoreNumber("width", clip.transform.width), clip.transform.width]) : clip.transform.width;
  const height = focusRestore ? interpolate(focusProgress, [0, 1], [restoreNumber("height", clip.transform.height), clip.transform.height]) : clip.transform.height;
  const focusTransform = focusRestore
    ? `scale(${interpolate(focusProgress, [0, 1], [restoreNumber("scale", 1), clip.transform.scale])}) rotate(${interpolate(focusProgress, [0, 1], [restoreNumber("rotation", 0), clip.transform.rotation])}deg)`
    : undefined;
  return (
    <div
      data-clip-id={clip.id}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        zIndex: clip.transform.zIndex,
        overflow,
        ...(focusRestore ? {opacity: clip.transform.opacity, transform: focusTransform, transformOrigin: "center", willChange: "left, top, width, height, transform"} : animated),
      }}
    >
      {children}
    </div>
  );
};

const StaticClipBox = ({clip, children, overflow = "hidden"}: {clip: Clip; children: ReactNode; overflow?: CSSProperties["overflow"]}) => (
  <div
    data-clip-id={clip.id}
    style={{
      position: "absolute",
      left: clip.transform.x,
      top: clip.transform.y,
      width: clip.transform.width,
      height: clip.transform.height,
      zIndex: clip.transform.zIndex,
      opacity: clip.transform.opacity,
      transform: `scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`,
      transformOrigin: "center",
      overflow,
    }}
  >
    {children}
  </div>
);

const MaterialSurface = ({clip, children}: {clip: Clip; children: ReactNode}) => {
  const tiltY = Math.max(-45, Math.min(45, Number(clip.props.tiltY ?? 0)));
  const tiltX = Math.max(-30, Math.min(30, Number(clip.props.tiltX ?? 0)));
  const borderColor = value(clip.props, ["borderColor", "accentColor"], "#38d9ff");
  const isDecoratedMaterial = clip.transform.zIndex > 0 || clip.props.importedMaterial === true || clip.props.recording === true;
  const materialSurfaceMode = value(clip.props, ["materialSurfaceMode"], "edge-glass");
  const useStyledSurface = isDecoratedMaterial && materialSurfaceMode === "styled";
  const useEdgeGlass = isDecoratedMaterial && materialSurfaceMode === "edge-glass";
  const useEdgeFrame = useEdgeGlass || useStyledSurface;
  const edgeMask = isDecoratedMaterial ? materialEdgeMask(clip) : undefined;
  const appearance = surfaceAppearance(clip, borderColor, {material: true, radius: 14});
  const glassBorderWidth = boundedNumber(clip.props.glassBorderWidth, 12, 2, 32);
  const glassBorderGlow = boundedNumber(clip.props.glassBorderGlow, 70, 0, 100) / 100;
  const glassBorderBlur = boundedNumber(clip.props.glassBlur, 12, 0, 40);
  const focusPipProgress = boundedNumber(clip.props.focusPipProgress, 1, 0, 1);
  const focusCircle = clip.props.focusPipShape === "circle";
  const resolvedRadius = focusCircle ? `${focusPipProgress * 50}%` : useEdgeFrame ? appearance.borderRadius : 0;
  return (
    <div
      style={{
        position: "relative",
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        overflow: "visible",
        borderRadius: resolvedRadius,
        background: clip.props.fullScreenFocus === true ? "#070a0f" : "transparent",
        transform: tiltX || tiltY ? `perspective(1400px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(0)` : "translateZ(0)",
        transformOrigin: "center",
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        willChange: "transform",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          borderRadius: resolvedRadius,
          maskImage: edgeMask,
          WebkitMaskImage: edgeMask,
          maskRepeat: edgeMask ? "no-repeat" : undefined,
          WebkitMaskRepeat: edgeMask ? "no-repeat" : undefined,
          maskSize: edgeMask ? "100% 100%" : undefined,
          WebkitMaskSize: edgeMask ? "100% 100%" : undefined,
        }}
      >
        {children}
        {useStyledSurface ? <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: "inherit",
            background: appearance.background,
            backgroundSize: appearance.backgroundSize,
            backdropFilter: appearance.backdropFilter,
            WebkitBackdropFilter: appearance.WebkitBackdropFilter,
          }}
        /> : null}
      </div>
      {useEdgeFrame ? <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          borderRadius: resolvedRadius,
          border: `2px solid ${hexRgba(borderColor, .9)}`,
          boxShadow: `0 0 ${16 + glassBorderGlow * 22}px ${hexRgba(borderColor, .28 + glassBorderGlow * .3)}, inset 0 0 ${10 + glassBorderGlow * 18}px ${hexRgba(borderColor, .16 + glassBorderGlow * .24)}, inset 0 1px 0 rgba(255,255,255,.7)`,
          opacity: focusPipProgress,
        }}
      >
        <div style={{position: "absolute", left: 0, right: 0, top: 0, height: glassBorderWidth, background: `linear-gradient(180deg, ${hexRgba(borderColor, .36)}, rgba(255,255,255,.12), transparent)`, backdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`, WebkitBackdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`}}/>
        <div style={{position: "absolute", left: 0, right: 0, bottom: 0, height: glassBorderWidth, background: `linear-gradient(0deg, ${hexRgba(borderColor, .32)}, rgba(255,255,255,.1), transparent)`, backdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`, WebkitBackdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`}}/>
        <div style={{position: "absolute", left: 0, top: glassBorderWidth, bottom: glassBorderWidth, width: glassBorderWidth, background: `linear-gradient(90deg, ${hexRgba(borderColor, .34)}, rgba(255,255,255,.1), transparent)`, backdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`, WebkitBackdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`}}/>
        <div style={{position: "absolute", right: 0, top: glassBorderWidth, bottom: glassBorderWidth, width: glassBorderWidth, background: `linear-gradient(270deg, ${hexRgba(borderColor, .34)}, rgba(255,255,255,.1), transparent)`, backdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`, WebkitBackdropFilter: `blur(${glassBorderBlur}px) saturate(175%)`}}/>
      </div> : null}
    </div>
  );
};

const MissingAsset = ({label, style}: {label: string; style: StyleProfile}) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      border: `2px dashed ${color(style, "riskRed", "#ff646a")}`,
      background: "rgba(20, 5, 8, .78)",
      color: color(style, "textPrimary", "#fff"),
      fontFamily: fontFamilies.system,
      fontSize: 28,
      fontWeight: 700,
      textAlign: "center",
      padding: 24,
    }}
  >
    素材缺失 · {label}
  </AbsoluteFill>
);

const TechGrid = ({style}: {style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const offset = frame % 48;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: color(style, "canvas", "#070A0F"),
        backgroundImage: `linear-gradient(rgba(56,217,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(56,217,255,.055) 1px, transparent 1px), radial-gradient(circle at 72% 22%, rgba(76,125,255,.2), transparent 38%)`,
        backgroundSize: "48px 48px, 48px 48px, 100% 100%",
        backgroundPosition: `${offset}px ${offset}px, ${offset}px ${offset}px, 0 0`,
      }}
    />
  );
};

const Caption = ({clip, style}: {clip: Clip; style: StyleProfile}) => (
  <AnimatedClipBox clip={clip} style={style}>
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...typographyStyle(clip, "title", {color: color(style, "textPrimary", "#fff"), fontSize: Math.max(28, clip.transform.height * 0.42), fontWeight: 800}),
        lineHeight: 1.25,
        textAlign: "center",
        textShadow: "0 3px 16px rgba(0,0,0,.88)",
      }}
    >
      {editableValue(clip.props, ["text", "title"], "字幕")}
    </div>
  </AnimatedClipBox>
);

const PanelFrame = ({clip, style, children, accent = "statusCyan"}: {clip: Clip; style: StyleProfile; children: ReactNode; accent?: string}) => {
  const resolvedAccent = value(clip.props, ["accentColor"], color(style, accent, "#38d9ff"));
  const resolvedBorder = value(clip.props, ["borderColor"], resolvedAccent);
  const appearance = surfaceAppearance(clip, resolvedBorder, {radius: Number(style.tokens.geometry.cornerRadius ?? 18)});
  return <AnimatedClipBox clip={clip} style={style}>
    <div
      style={{
        position: "relative",
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        ...appearance,
        overflow: "hidden",
        backfaceVisibility: "hidden",
      }}
    >
      <div style={{position: "absolute", inset: "0 auto 0 0", width: 6, background: resolvedAccent}} />
      <div style={{position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${resolvedBorder}, transparent 68%)`}} />
      {children}
    </div>
  </AnimatedClipBox>;
};

const itemProgress = (frame: number, index: number, count: number, duration: number) => {
  const usable = Math.max(1, Math.min(duration * .58, 48));
  const start = (index / Math.max(1, count)) * usable;
  return interpolate(frame, [start, start + Math.max(5, usable / Math.max(2, count))], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
};

const stringItems = (value: unknown, fallback: string[]) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 5) : fallback;
type MotionSlotStyle = {
  appearFrame?: number;
  fontColor?: string;
  fontSize?: number;
  highlightText?: string;
  highlightColor?: string;
  accentColor?: string;
};
const motionSlotStylesFor = (clip: Clip, kind: string): MotionSlotStyle[] => {
  const root = clip.props.motionSlotStyles;
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];
  const entries = (root as Record<string, unknown>)[kind];
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
    const item = entry as Record<string, unknown>;
    return {
      ...(Number.isFinite(Number(item.appearFrame)) ? {appearFrame: Math.max(0, Number(item.appearFrame))} : {}),
      ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
      ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
      ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
      ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
      ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
    };
  });
};

const ProcessFlow = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const steps = stringItems(clip.props.steps, ["确认需求", "生成方案", "验证结果", "完成交付"]);
  const slotStyles = motionSlotStylesFor(clip, "steps");
  const accent = value(clip.props, ["accentColor"], color(style, "statusCyan", "#38d9ff"));
  const active = Math.min(steps.length - 1, Math.floor((frame / Math.max(1, clip.durationInFrames - 1)) * steps.length));
  const eyebrow = editableValue(clip.props, ["eyebrowText"], `PROCESS · ${String(active + 1).padStart(2, "0")}`);
  return <PanelFrame clip={clip} style={style}>
    <div style={{height: "100%", boxSizing: "border-box", padding: "28px 34px 30px 42px", display: "flex", flexDirection: "column", fontFamily: fontFamilies.system}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20}}>
        <div>{eyebrow ? <div style={{...typographyStyle(clip, "eyebrow", {fontSize: Math.max(20, clip.transform.height * .075), color: accent, fontWeight: 800}), letterSpacing: 3}}>{eyebrow}</div> : null}<div style={{marginTop: eyebrow ? 8 : 0, ...typographyStyle(clip, "title", {fontSize: Math.max(30, clip.transform.height * .14), color: color(style, "textPrimary", "#fff"), fontWeight: 900})}}>{editableValue(clip.props, ["title"], "从需求到交付")}</div></div>
        <div style={{maxWidth: "38%", ...typographyStyle(clip, "detail", {color: color(style, "textSecondary", "#a9b7c6"), fontSize: Math.max(15, clip.transform.height * .055), fontWeight: 500}), lineHeight: 1.45, textAlign: "right"}}>{editableValue(clip.props, ["detail"], "当前步骤会随时间依次点亮")}</div>
      </div>
      <div style={{position: "relative", flex: 1, marginTop: 28, display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 12, alignItems: "center"}}>
        <div style={{position: "absolute", left: "7%", right: "7%", top: "50%", height: 3, background: "rgba(120,161,190,.2)"}}/>
        <div style={{position: "absolute", left: "7%", top: "50%", height: 3, width: `${steps.length <= 1 ? 0 : (active / (steps.length - 1)) * 86}%`, background: `linear-gradient(90deg, ${accent}, ${accent}88)`, boxShadow: `0 0 16px ${accent}88`}}/>
        {steps.map((step, index) => {
          const slot = slotStyles[index] ?? {};
          const progress = typeof slot.appearFrame === "number"
            ? interpolate(frame, [slot.appearFrame, slot.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})
            : itemProgress(frame, index, steps.length, clip.durationInFrames);
          const reached = index <= active;
          const slotAccent = slot.accentColor ?? slot.highlightColor ?? accent;
          const slotColor = slot.fontColor ?? (reached ? color(style, "textPrimary", "#fff") : color(style, "textSecondary", "#a9b7c6"));
          const slotFontSize = slot.fontSize ?? Math.max(17, clip.transform.height * .06);
          return <div key={`${index}-${step}`} style={{position: "relative", zIndex: 1, opacity: progress, transform: `translateY(${(1 - progress) * 18}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 10}}>
            <div style={{width: Math.max(34, clip.transform.height * .12), height: Math.max(34, clip.transform.height * .12), borderRadius: "50%", display: "grid", placeItems: "center", border: `2px solid ${reached ? slotAccent : "rgba(130,158,180,.3)"}`, background: reached ? `${slotAccent}22` : "#0b121a", color: reached ? slotAccent : "#6f8290", fontSize: Math.max(17, clip.transform.height * .055), fontWeight: 900, boxShadow: reached ? `0 0 22px ${slotAccent}55` : "none"}}>{String(index + 1).padStart(2, "0")}</div>
            <div style={{padding: "8px 10px", borderRadius: 8, background: reached ? "rgba(13,27,37,.94)" : "rgba(10,17,24,.82)", ...typographyStyle(clip, "body", {color: slotColor, fontSize: slotFontSize, fontWeight: reached ? 800 : 650}), textAlign: "center", whiteSpace: "nowrap"}}>{highlightedText(step, slot.highlightText ?? "", slot.highlightColor ?? slotAccent)}</div>
          </div>;
        })}
      </div>
    </div>
  </PanelFrame>;
};

type ModuleItem = {title: string; detail: string} & MotionSlotStyle;
const moduleItems = (source: unknown): ModuleItem[] => Array.isArray(source) ? source.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
  title: String(item.title ?? "模块"),
  detail: String(item.detail ?? "功能说明"),
  ...(Number.isFinite(Number(item.appearFrame)) ? {appearFrame: Math.max(0, Number(item.appearFrame))} : {}),
  ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
  ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
  ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
  ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
  ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
})).slice(0, 6) : [];

const ModuleGrid = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const modules = moduleItems(clip.props.modules);
  const items = modules.length >= 2 ? modules : [{title: "选题", detail: "热点与普通人相关性"}, {title: "脚本", detail: "删废话并重建钩子"}, {title: "拍摄", detail: "镜头、动作与证据"}, {title: "剪辑", detail: "动效和案例演示"}];
  const accent = value(clip.props, ["accentColor"], color(style, "statusCyan", "#38d9ff"));
  const active = Math.min(items.length - 1, Math.floor((frame / Math.max(1, clip.durationInFrames - 1)) * items.length));
  const columns = items.length <= 4 ? 2 : 3;
  const eyebrow = editableValue(clip.props, ["eyebrowText"], `MODULE GRID · ${String(items.length).padStart(2, "0")}`);
  return <PanelFrame clip={clip} style={style}>
    <div style={{height: "100%", boxSizing: "border-box", padding: "26px 34px 30px 42px", display: "flex", flexDirection: "column", fontFamily: fontFamilies.system}}>
      <div>{eyebrow ? <div style={{...typographyStyle(clip, "eyebrow", {fontSize: Math.max(18, clip.transform.height * .065), color: accent, fontWeight: 800}), letterSpacing: 3}}>{eyebrow}</div> : null}<div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginTop: eyebrow ? 6 : 0}}><div style={typographyStyle(clip, "title", {fontSize: Math.max(29, clip.transform.height * .13), color: color(style, "textPrimary", "#fff"), fontWeight: 900})}>{editableValue(clip.props, ["title"], "AI 工作流能力")}</div><div style={typographyStyle(clip, "detail", {color: color(style, "textSecondary", "#a9b7c6"), fontSize: Math.max(14, clip.transform.height * .05), fontWeight: 500})}>{editableValue(clip.props, ["detail"], "一个模块只表达一个功能")}</div></div></div>
      <div style={{flex: 1, minHeight: 0, marginTop: 18, display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12}}>
        {items.map((item, index) => {
          const progress = typeof item.appearFrame === "number"
            ? interpolate(frame, [item.appearFrame, item.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})
            : itemProgress(frame, index, items.length, clip.durationInFrames);
          const selected = index === active;
          const slotAccent = item.accentColor ?? item.highlightColor ?? accent;
          const slotFontColor = item.fontColor ?? color(style, "textPrimary", "#fff");
          const slotFontSize = item.fontSize ?? Math.max(19, clip.transform.height * .065);
          return <div key={`${index}-${item.title}`} style={{opacity: progress, transform: `translateY(${(1 - progress) * 18}px) scale(${.96 + progress * .04})`, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${selected ? slotAccent : "rgba(122,161,192,.22)"}`, background: selected ? `linear-gradient(135deg, ${slotAccent}1f, rgba(12,20,29,.96))` : "rgba(10,17,25,.82)", boxShadow: selected ? `0 0 24px ${slotAccent}35` : "none", padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center"}}>
            <div style={{width: Math.max(30, clip.transform.height * .09), height: Math.max(30, clip.transform.height * .09), borderRadius: 9, display: "grid", placeItems: "center", background: selected ? slotAccent : "rgba(90,118,138,.18)", color: selected ? "#071018" : "#7e93a2", fontSize: Math.max(15, clip.transform.height * .045), fontWeight: 950}}>{String(index + 1).padStart(2, "0")}</div>
            <div style={{minWidth: 0}}><div style={typographyStyle(clip, "body", {color: slotFontColor, fontSize: slotFontSize, fontWeight: 850})}>{highlightedText(item.title, item.highlightText ?? "", item.highlightColor ?? slotAccent)}</div><div style={{marginTop: 5, ...typographyStyle(clip, "detail", {color: color(style, "textSecondary", "#a9b7c6"), fontSize: Math.max(13, slotFontSize * .66), fontWeight: 500}), lineHeight: 1.35}}>{item.detail}</div></div>
          </div>;
        })}
      </div>
    </div>
  </PanelFrame>;
};

type FormulaTerm = {label: string; value: string; operator?: string} & MotionSlotStyle;
const formulaTerms = (source: unknown): FormulaTerm[] => Array.isArray(source) ? source.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
  label: String(item.label ?? "条件"),
  value: String(item.value ?? "0"),
  ...(typeof item.operator === "string" ? {operator: item.operator} : {}),
  ...(Number.isFinite(Number(item.appearFrame)) ? {appearFrame: Math.max(0, Number(item.appearFrame))} : {}),
  ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
  ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
  ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
  ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
  ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
})).slice(0, 5) : [];

const DataFormula = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const parsed = formulaTerms(clip.props.terms);
  const terms = parsed.length >= 2 ? parsed : [{label: "节省时间", value: "20 小时", operator: "×"}, {label: "每小时成本", value: "100 元", operator: "="}];
  const accent = value(clip.props, ["accentColor"], color(style, "resultGold", "#e6b85c"));
  const resultProgress = interpolate(frame, [clip.durationInFrames * .55, clip.durationInFrames * .72], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const eyebrow = editableValue(clip.props, ["eyebrowText"], "DATA FORMULA · VERIFIED");
  return <PanelFrame clip={clip} style={style} accent="resultGold">
    <div style={{height: "100%", boxSizing: "border-box", padding: "26px 34px 24px 42px", display: "flex", flexDirection: "column", fontFamily: fontFamilies.system}}>
      {eyebrow ? <div style={{...typographyStyle(clip, "eyebrow", {fontSize: Math.max(18, clip.transform.height * .065), color: accent, fontWeight: 800}), letterSpacing: 3}}>{eyebrow}</div> : null}
      <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginTop: eyebrow ? 6 : 0}}><div style={typographyStyle(clip, "title", {fontSize: Math.max(29, clip.transform.height * .13), color: color(style, "textPrimary", "#fff"), fontWeight: 900})}>{editableValue(clip.props, ["title"], "价值计算")}</div><div style={typographyStyle(clip, "detail", {color: color(style, "textSecondary", "#a9b7c6"), fontSize: Math.max(14, clip.transform.height * .05), fontWeight: 500})}>{editableValue(clip.props, ["detail"], "过程、单位和口径同时可见")}</div></div>
      <div style={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 0}}>
        {terms.map((term, index) => {
          const progress = typeof term.appearFrame === "number"
            ? interpolate(frame, [term.appearFrame, term.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})
            : itemProgress(frame, index, terms.length, clip.durationInFrames);
          const slotAccent = term.accentColor ?? term.highlightColor ?? accent;
          const slotFontColor = term.fontColor ?? color(style, "textPrimary", "#fff");
          const slotFontSize = term.fontSize ?? Math.max(24, clip.transform.height * .095);
          return <div key={`${index}-${term.label}`} style={{display: "contents"}}>
            <div style={{opacity: progress, transform: `translateY(${(1 - progress) * 18}px)`, minWidth: 0, padding: "14px 16px", borderRadius: 12, border: `1px solid ${hexRgba(slotAccent, .42)}`, background: "rgba(10,17,25,.86)", textAlign: "center"}}><div style={typographyStyle(clip, "detail", {color: color(style, "textSecondary", "#a9b7c6"), fontSize: Math.max(13, slotFontSize * .54), fontWeight: 500})}>{highlightedText(term.label, term.highlightText ?? "", term.highlightColor ?? slotAccent)}</div><div style={{marginTop: 7, ...typographyStyle(clip, "body", {color: slotFontColor, fontSize: slotFontSize, fontWeight: 900}), whiteSpace: "nowrap"}}>{term.value}</div></div>
            {term.operator ? <div style={{opacity: progress, color: slotAccent, fontSize: Math.max(28, clip.transform.height * .11), fontWeight: 950}}>{term.operator}</div> : null}
          </div>;
        })}
        <div style={{opacity: resultProgress, transform: `scale(${.82 + resultProgress * .18})`, padding: "16px 20px", borderRadius: 14, background: `${accent}20`, border: `1px solid ${accent}`, boxShadow: `0 0 28px ${accent}45`, textAlign: "center"}}><div style={{...typographyStyle(clip, "detail", {color: accent, fontSize: Math.max(13, clip.transform.height * .045), fontWeight: 800})}}>最终结果</div><div style={{marginTop: 5, ...typographyStyle(clip, "body", {color: color(style, "textPrimary", "#fff"), fontSize: Math.max(28, clip.transform.height * .12), fontWeight: 900}), whiteSpace: "nowrap"}}>{editableValue(clip.props, ["result"], "2,000 元")}</div></div>
      </div>
      <div style={{opacity: resultProgress, color: color(style, "textSecondary", "#a9b7c6"), fontSize: Math.max(12, clip.transform.height * .042), lineHeight: 1.35}}>口径：{editableValue(clip.props, ["disclaimer"], "示例口径，请替换为本条视频的真实数据")}</div>
    </div>
  </PanelFrame>;
};

const numeric = (source: unknown, fallback: number) => typeof source === "number" && Number.isFinite(source) ? source : fallback;
const simpleStrings = (source: unknown, fallback: string[], maximum = 8) => Array.isArray(source) ? source.map(String).map((item) => item.trim()).filter(Boolean).slice(0, maximum) : fallback;
const revealProgress = (clip: Clip, frame: number, offset = 0) => {
  const start = numeric(clip.props.textStartFrame, 8) + offset;
  return interpolate(frame, [start, start + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
};

const RevealedText = ({clip, children, offset = 0, style: textStyle}: {clip: Clip; children: string; offset?: number; style?: CSSProperties}) => {
  const frame = useCurrentFrame();
  const progress = revealProgress(clip, frame, offset);
  const animation = value(clip.props, ["textAnimation"], "fade-up");
  const visibleText = animation === "typewriter" ? children.slice(0, Math.ceil(children.length * progress)) : children;
  const transform = animation === "scale-in" ? `scale(${.72 + progress * .28})` : animation === "slide-right" ? `translateX(${(1 - progress) * 34}px)` : `translateY(${(1 - progress) * 18}px)`;
  return <div style={{opacity: progress, transform, transformOrigin: "center", ...textStyle}}>{visibleText}</div>;
};

const textLayerProgress = (clip: Clip, frame: number, layer: number): number => {
  const start = numeric(clip.props.textStartFrame, 3) + layer * boundedNumber(clip.props.staggerFrames, 4, 0, 30);
  return smootherStep(interpolate(frame, [start, start + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
};

const TypographyLayer = ({clip, layer, children, style: textStyle, align = "left"}: {
  clip: Clip;
  layer: number;
  children: ReactNode;
  style?: CSSProperties;
  align?: "left" | "center" | "right";
}) => {
  const frame = useCurrentFrame();
  const progress = textLayerProgress(clip, frame, layer);
  const animation = value(clip.props, ["textAnimation"], "mask-rise");
  const transform = animation === "word-pop" || animation === "scale-in"
    ? `scale(${.78 + progress * .22})`
    : animation === "tracking-expand"
      ? `translateX(${(1 - progress) * 18}px)`
      : animation === "slide-right"
        ? `translateX(${(1 - progress) * 34}px)`
        : `translateY(${(1 - progress) * 30}px)`;
  const letterSpacing = animation === "tracking-expand" ? `${.32 - progress * .22}em` : undefined;
  return <div style={{overflow: animation === "mask-rise" ? "hidden" : "visible", textAlign: align}}>
    <div style={{opacity: progress, transform, transformOrigin: `${align} center`, letterSpacing, ...textStyle}}>{children}</div>
  </div>;
};

const highlightedText = (source: string, highlighted: string, accent: string): ReactNode => {
  if (!highlighted || !source.includes(highlighted)) return source;
  const [before, ...rest] = source.split(highlighted);
  return <>{before}<span style={{color: accent, textShadow: `0 0 18px ${hexRgba(accent, .28)}`}}>{highlighted}</span>{rest.join(highlighted)}</>;
};

const mediaSourceFor = (assetMap: Record<string, string>, assetId: unknown): string | undefined => {
  if (typeof assetId !== "string" || !assetId) return undefined;
  const path = assetMap[assetId];
  return path ? staticFile(path) : undefined;
};

const TypographySectionLockup = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const eyebrow = editableValue(clip.props, ["eyebrowText"], "AI PRACTICE");
  const title = editableValue(clip.props, ["title"], "当前章节");
  const detail = editableValue(clip.props, ["detail"], "一句中文定位");
  return <AnimatedClipBox clip={clip} style={style} overflow="visible">
    <div style={{height: "100%", display: "flex", alignItems: "flex-start", gap: 14, fontFamily: fontFamilies.system}}>
      <div style={{width: 5, height: "72%", minHeight: 30, marginTop: 2, borderRadius: 6, background: accent, boxShadow: `0 0 14px ${hexRgba(accent, .7)}`}}/>
      <div style={{minWidth: 0}}>
        {eyebrow ? <TypographyLayer clip={clip} layer={0} style={{...typographyStyle(clip, "eyebrow", {fontSize: 18, fontWeight: 850, color: accent}), lineHeight: 1, textTransform: "uppercase"}}>{eyebrow}</TypographyLayer> : null}
        {title ? <TypographyLayer clip={clip} layer={1} style={{marginTop: 9, ...typographyStyle(clip, "title", {fontSize: 34, fontWeight: 900, color: "#fff"}), lineHeight: 1.08, textShadow: "0 3px 14px rgba(0,0,0,.82)"}}>{title}</TypographyLayer> : null}
        {detail ? <TypographyLayer clip={clip} layer={2} style={{marginTop: 7, ...typographyStyle(clip, "detail", {fontSize: 18, fontWeight: 600, color: "#b7c2ca"}), lineHeight: 1.2, textShadow: "0 2px 10px rgba(0,0,0,.82)"}}>{detail}</TypographyLayer> : null}
      </div>
    </div>
  </AnimatedClipBox>;
};

const TypographyLogoTitle = ({clip, style, src}: {clip: Clip; style: StyleProfile; src: string | undefined}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const showLogo = clip.props.showLogo !== false;
  const logoProgress = textLayerProgress(clip, frame, 0);
  const eyebrow = editableValue(clip.props, ["eyebrowText"], "AI · FIELD NOTE");
  const title = editableValue(clip.props, ["title"], "带 Logo 的观点标题");
  const detail = editableValue(clip.props, ["detail"], "Logo、眉题、主标题依次进入");
  return <AnimatedClipBox clip={clip} style={style} overflow="visible">
    <div style={{height: "100%", display: "flex", alignItems: "center", gap: 22, fontFamily: fontFamilies.system}}>
      {showLogo ? <div style={{
        flex: "0 0 auto",
        width: "20%",
        maxWidth: clip.transform.height * .72,
        aspectRatio: "1",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        borderRadius: "24%",
        border: `2px solid ${accent}`,
        background: `linear-gradient(145deg,${hexRgba(accent, .3)},rgba(7,15,24,.9))`,
        boxShadow: `0 0 ${12 + logoProgress * 24}px ${hexRgba(accent, .48)}`,
        opacity: logoProgress,
        transform: `scale(${.68 + logoProgress * .32}) rotate(${(1 - logoProgress) * -8}deg)`,
      }}>
        {src ? <Img src={src} style={{width: "70%", height: "70%", objectFit: "contain"}}/> : <span style={{color: "#fff", fontSize: Math.max(18, clip.transform.height * .2), fontWeight: 950, letterSpacing: -.5}}>{editableValue(clip.props, ["logoText"], "AI")}</span>}
      </div> : null}
      <div style={{minWidth: 0, flex: 1}}>
        {eyebrow ? <TypographyLayer clip={clip} layer={showLogo ? 1 : 0} style={{...typographyStyle(clip, "eyebrow", {fontSize: 17, fontWeight: 850, color: accent}), textTransform: "uppercase", lineHeight: 1}}>{eyebrow}</TypographyLayer> : null}
        {title ? <TypographyLayer clip={clip} layer={showLogo ? 2 : 1} style={{marginTop: 10, ...typographyStyle(clip, "title", {fontSize: 50, fontWeight: 900, color: "#fff"}), lineHeight: 1.06, textShadow: "0 4px 18px rgba(0,0,0,.76)"}}>{title}</TypographyLayer> : null}
        {detail ? <TypographyLayer clip={clip} layer={showLogo ? 3 : 2} style={{marginTop: 10, ...typographyStyle(clip, "detail", {fontSize: 20, fontWeight: 600, color: "#aebbc5"}), lineHeight: 1.28}}>{detail}</TypographyLayer> : null}
      </div>
    </div>
  </AnimatedClipBox>;
};

const TypographyHeroFocus = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#46e0a0");
  const eyebrow = editableValue(clip.props, ["eyebrowText"], "EXPAND YOUR SCOPE");
  const title = editableValue(clip.props, ["title"], "拓宽思路");
  const detail = editableValue(clip.props, ["detail"], "让一个关键词成为画面焦点");
  const highlight = editableValue(clip.props, ["highlightText"], "");
  const accentProgress = textLayerProgress(clip, frame, 1);
  return <AnimatedClipBox clip={clip} style={style} overflow="visible">
    <div style={{height: "100%", display: "grid", placeItems: "center", fontFamily: fontFamilies.system, textAlign: "center"}}>
      <div style={{minWidth: "72%", maxWidth: "100%"}}>
        {eyebrow ? <TypographyLayer clip={clip} layer={0} align="center" style={{...typographyStyle(clip, "eyebrow", {fontSize: 18, fontWeight: 850, color: accent}), textTransform: "uppercase", lineHeight: 1}}>{eyebrow}</TypographyLayer> : null}
        <div style={{display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 10}}>
          <div style={{width: 52, height: 3, transform: `scaleX(${accentProgress})`, transformOrigin: "right", background: accent, boxShadow: `0 0 12px ${hexRgba(accent, .64)}`}}/>
          <TypographyLayer clip={clip} layer={1} align="center" style={{...typographyStyle(clip, "title", {fontSize: 82, fontWeight: 950, color: "#fff"}), lineHeight: .98, letterSpacing: "-.055em", textShadow: "0 6px 24px rgba(0,0,0,.82)"}}>{highlightedText(title, highlight, accent)}</TypographyLayer>
          <div style={{width: 10, height: 10, borderTop: `3px solid ${accent}`, borderRight: `3px solid ${accent}`, transform: `rotate(45deg) scale(${accentProgress})`}}/>
        </div>
        {detail ? <TypographyLayer clip={clip} layer={2} align="center" style={{marginTop: 14, ...typographyStyle(clip, "detail", {fontSize: 20, fontWeight: 600, color: "#bac4cc"}), lineHeight: 1.25}}>{detail}</TypographyLayer> : null}
      </div>
    </div>
  </AnimatedClipBox>;
};

type TypographyPoint = {
  text: string;
  appearFrame: number;
  accentColor?: string;
  fontColor?: string;
  logoText?: string;
  highlightText?: string;
  fontSize?: number;
  surfaceStyle?: SurfaceStyle;
};
const typographyPoints = (source: unknown): TypographyPoint[] => Array.isArray(source) ? source
  .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  .map((item, index) => ({
    text: String(item.text ?? `观点 ${index + 1}`),
    appearFrame: Math.max(0, Number(item.appearFrame ?? 8 + index * 50)),
    ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
    ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
    ...(typeof item.logoText === "string" ? {logoText: item.logoText} : {}),
    ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
    ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
    ...(typeof item.surfaceStyle === "string" ? {surfaceStyle: item.surfaceStyle as SurfaceStyle} : {}),
  }))
  .slice(0, 5) : [];

const TypographyFocusStack = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const points = typographyPoints(clip.props.points);
  const items = points.length ? points : [{text: "第一个判断", appearFrame: 8}, {text: "第二个判断", appearFrame: 58}, {text: "第三个判断", appearFrame: 108}];
  const activeIndex = items.reduce((latest, item, index) => frame >= item.appearFrame ? index : latest, -1);
  const active = (activeIndex >= 0 ? items[activeIndex] : items[0]) ?? {text: "第一个判断", appearFrame: 8};
  const accent = active.accentColor ?? value(clip.props, ["accentColor"], "#38d9ff");
  const dimOpacity = boundedNumber(clip.props.dimOpacity, 42, 0, 100) / 100;
  const keepPreviousBright = clip.props.historyMode === "bright";
  const eyebrow = editableValue(clip.props, ["eyebrowText"], "KEY POINTS");
  const header = editableValue(clip.props, ["title"], "观点接力");
  const detail = editableValue(clip.props, ["detail"], "");
  const pointFontSize = boundedNumber(clip.props.pointFontSize, 48, 12, 4096);
  const pointFontWeight = boundedNumber(clip.props.pointFontWeight, 850, 400, 900);
  const pointFontColor = value(clip.props, ["pointFontColor"], "#ffffff");
  const pointFontFamily = progressiveFontFamilies[value(clip.props, ["pointFontFamily"], "system")] ?? fontFamilies.system;
  return <AnimatedClipBox clip={clip} style={style} overflow="visible">
    <div style={{height: "100%", boxSizing: "border-box", padding: "4% 4.5%", display: "flex", flexDirection: "column", fontFamily: pointFontFamily, ...surfaceAppearance(clip, accent, {radius: 14})}}>
      <div style={{flex: "0 0 auto"}}>
        {eyebrow ? <TypographyLayer clip={clip} layer={0} style={{...typographyStyle(clip, "eyebrow", {fontSize: 16, fontWeight: 850, color: accent}), textTransform: "uppercase"}}>{eyebrow}</TypographyLayer> : null}
        {header ? <TypographyLayer clip={clip} layer={1} style={{marginTop: 7, ...typographyStyle(clip, "detail", {fontSize: 22, fontWeight: 750, color: "#c4cbd1"})}}>{header}</TypographyLayer> : null}
        {detail ? <TypographyLayer clip={clip} layer={2} style={{marginTop: 6, ...typographyStyle(clip, "body", {fontSize: 16, fontWeight: 600, color: "#8f9ba5"})}}>{detail}</TypographyLayer> : null}
      </div>
      <div style={{flex: "1 1 auto", minHeight: 0, marginTop: "4%", display: "grid", gridTemplateRows: `repeat(${items.length}, minmax(0, 1fr))`, gap: 10}}>
        {items.map((item, index) => {
          const visible = smootherStep(interpolate(frame, [item.appearFrame, item.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
          const hasAppeared = frame >= item.appearFrame;
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          const itemAccent = item.accentColor ?? value(clip.props, ["accentColor"], "#38d9ff");
          const itemFontSize = boundedNumber(item.fontSize, pointFontSize, 1, 4096);
          const itemOpacity = !hasAppeared ? 0 : visible * (isActive ? 1 : isPast ? keepPreviousBright ? 1 : dimOpacity : 0);
          return <div key={`${index}-${item.text}`} style={{
            minWidth: 0,
            padding: "9px 12px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: itemOpacity,
            visibility: hasAppeared ? "visible" : "hidden",
            transform: `translateX(${(1 - visible) * 22}px)`,
          }}>
            <span style={{flex: "0 0 auto", width: 40, color: itemAccent, fontSize: Math.max(14, itemFontSize * .34), fontWeight: 900, letterSpacing: ".03em"}}>{item.logoText || String(index + 1).padStart(2, "0")}</span>
            <span style={{width: 36, height: 3, flex: "0 0 auto", background: itemAccent, boxShadow: `0 0 12px ${hexRgba(itemAccent, .52)}`, transform: `scaleX(${visible})`, transformOrigin: "left"}}/>
            <span style={{minWidth: 0, color: item.fontColor ?? pointFontColor, fontSize: itemFontSize, fontWeight: pointFontWeight, lineHeight: 1.12, letterSpacing: "-.035em", textShadow: "0 5px 22px rgba(0,0,0,.78)"}}>{highlightedText(item.text, item.highlightText ?? "", itemAccent)}</span>
          </div>;
        })}
      </div>
    </div>
  </AnimatedClipBox>;
};

const TypographyProfileProof = ({clip, style, src}: {clip: Clip; style: StyleProfile; src: string | undefined}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#46e0a0");
  const mediaSide = value(clip.props, ["mediaSide"], "right");
  const mediaRatio = boundedNumber(clip.props.mediaRatio, 46, 30, 65);
  const mediaProgress = smootherStep(interpolate(frame, [6, 20], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
  const facts = simpleStrings(clip.props.facts, ["第一条履历或事实", "第二条履历或事实", "第三条履历或事实"], 5);
  const factStyles = motionSlotStylesFor(clip, "facts");
  const cleanSource = src?.toLowerCase().split(/[?#]/)[0];
  const videoSource = Boolean(cleanSource && /\.(mp4|mov|m4v|webm)$/.test(cleanSource));
  const textPanel = <div style={{minWidth: 0, flex: `0 0 ${100 - mediaRatio}%`, padding: "2% 3%", boxSizing: "border-box"}}>
    <TypographyLayer clip={clip} layer={0} style={{...typographyStyle(clip, "eyebrow", {fontSize: 16, fontWeight: 850, color: accent}), textTransform: "uppercase"}}>{editableValue(clip.props, ["eyebrowText"], "CASE PROFILE")}</TypographyLayer>
    <TypographyLayer clip={clip} layer={1} style={{marginTop: 18, ...typographyStyle(clip, "detail", {fontSize: 22, fontWeight: 650, color: "#f0f2f4"}), lineHeight: 1}}>{editableValue(clip.props, ["latinTitle"], "Case Subject")}</TypographyLayer>
    <TypographyLayer clip={clip} layer={2} style={{marginTop: 8, ...typographyStyle(clip, "title", {fontSize: 66, fontWeight: 950, color: "#fff"}), lineHeight: .98, letterSpacing: "-.055em", textShadow: "0 6px 22px rgba(0,0,0,.82)"}}>{editableValue(clip.props, ["title"], "人物或项目名称")}</TypographyLayer>
    <TypographyLayer clip={clip} layer={3} style={{marginTop: 12, ...typographyStyle(clip, "detail", {fontSize: 19, fontWeight: 600, color: "#aeb9c1"}), lineHeight: 1.3}}>{editableValue(clip.props, ["detail"], "一句身份或案例定义")}</TypographyLayer>
    <div style={{marginTop: 24, display: "grid", gap: 12}}>
      {facts.map((fact, index) => {
        const slot = factStyles[index] ?? {};
        const progress = typeof slot.appearFrame === "number"
          ? interpolate(frame, [slot.appearFrame, slot.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})
          : textLayerProgress(clip, frame, 4 + index);
        const slotAccent = slot.accentColor ?? slot.highlightColor ?? accent;
        const slotFontColor = slot.fontColor ?? "#f2f4f6";
        const slotFontSize = slot.fontSize ?? Math.max(17, clip.transform.height * .038);
        return <div key={`${index}-${fact}`} style={{display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 10, alignItems: "center", opacity: progress, transform: `translateX(${(1 - progress) * 22}px)`}}>
          <span style={{color: slotAccent, fontSize: 18, fontWeight: 900, textShadow: `0 0 12px ${hexRgba(slotAccent, .7)}`}}>×</span>
          <span style={{color: slotFontColor, fontSize: slotFontSize, fontWeight: 750, lineHeight: 1.25}}>{highlightedText(fact, slot.highlightText ?? "", slot.highlightColor ?? slotAccent)}</span>
        </div>;
      })}
    </div>
  </div>;
  const mediaPanel = <div style={{
    position: "relative",
    flex: `0 0 ${mediaRatio}%`,
    height: "78%",
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: 14,
    border: `1px solid ${hexRgba(accent, .62)}`,
    boxShadow: `0 16px 42px rgba(0,0,0,.38),0 0 22px ${hexRgba(accent, .2)}`,
    opacity: mediaProgress,
    transform: `translateX(${(1 - mediaProgress) * (mediaSide === "right" ? 38 : -38)}px) scale(${.96 + mediaProgress * .04})`,
  }}>
    {src ? videoSource
      ? <Html5Video src={src} muted startFrom={clip.sourceInFrames} pauseWhenBuffering={false} style={{width: "100%", height: "100%", objectFit: "cover"}}/>
      : <Img src={src} style={{width: "100%", height: "100%", objectFit: "cover"}}/>
      : <div style={{width: "100%", height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(135deg,rgba(20,31,42,.94),rgba(6,10,16,.98))", color: "#8fa0ad", fontSize: 20, fontWeight: 700}}>选择案例图片或视频</div>}
    <div style={{position: "absolute", inset: 0, pointerEvents: "none", background: `linear-gradient(${mediaSide === "right" ? "90deg" : "270deg"},rgba(5,9,14,.38),transparent 22%)`}}/>
  </div>;
  return <AnimatedClipBox clip={clip} style={style} overflow="visible">
    <div style={{height: "100%", display: "flex", flexDirection: mediaSide === "right" ? "row" : "row-reverse", alignItems: "stretch", gap: "3%", fontFamily: fontFamilies.system}}>
      {textPanel}{mediaPanel}
    </div>
  </AnimatedClipBox>;
};

type TypographyCase = {
  title: string;
  detail: string;
  appearFrame: number;
  assetId?: string;
  accentColor?: string;
  fontColor?: string;
  surfaceStyle?: SurfaceStyle;
  titleFontSize?: number;
  detailFontSize?: number;
  titleColor?: string;
  detailColor?: string;
  titleHighlightText?: string;
  detailHighlightText?: string;
  highlightColor?: string;
};
const typographyCases = (source: unknown): TypographyCase[] => Array.isArray(source) ? source
  .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  .map((item, index) => ({
    title: String(item.title ?? `案例 ${index + 1}`),
    detail: String(item.detail ?? ""),
    appearFrame: Math.max(0, Number(item.appearFrame ?? 10 + index * 35)),
    ...(typeof item.assetId === "string" && item.assetId ? {assetId: item.assetId} : {}),
    ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
    ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
    ...(typeof item.surfaceStyle === "string" ? {surfaceStyle: item.surfaceStyle as SurfaceStyle} : {}),
    ...(Number.isFinite(Number(item.titleFontSize)) ? {titleFontSize: Math.max(1, Number(item.titleFontSize))} : {}),
    ...(Number.isFinite(Number(item.detailFontSize)) ? {detailFontSize: Math.max(1, Number(item.detailFontSize))} : {}),
    ...(typeof item.titleColor === "string" ? {titleColor: item.titleColor} : {}),
    ...(typeof item.detailColor === "string" ? {detailColor: item.detailColor} : {}),
    ...(typeof item.titleHighlightText === "string" ? {titleHighlightText: item.titleHighlightText} : {}),
    ...(typeof item.detailHighlightText === "string" ? {detailHighlightText: item.detailHighlightText} : {}),
    ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
  }))
  .slice(0, 6) : [];

const surfacePanelStyle = (accent: string, opacity = .78, surfaceStyle: SurfaceStyle = "glass"): CSSProperties => surfaceStyle === "none" ? {
  boxSizing: "border-box",
  border: "none",
  background: "transparent",
  boxShadow: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
} : {
  boxSizing: "border-box",
  border: `1px solid ${hexRgba(accent, .52)}`,
  background: `linear-gradient(135deg,rgba(20,33,45,${opacity}),rgba(5,10,16,${Math.max(.48, opacity - .16)}))`,
  boxShadow: `0 16px 38px rgba(0,0,0,.34),0 0 22px ${hexRgba(accent, .16)},inset 0 1px 0 rgba(255,255,255,.08)`,
};

const TypographyCaseGallery = ({clip, style, assetMap}: {clip: Clip; style: StyleProfile; assetMap: Record<string, string>}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const headerSurface = value(clip.props, ["surfaceStyle"], "glass") as SurfaceStyle;
  const highlightColor = value(clip.props, ["highlightColor", "accentColor"], accent);
  const parsed = typographyCases(clip.props.cases);
  const cases = parsed.length ? parsed : [{title: "案例一", detail: "结果或标签", appearFrame: 10}, {title: "案例二", detail: "结果或标签", appearFrame: 45}, {title: "案例三", detail: "结果或标签", appearFrame: 80}];
  return <AnimatedClipBox clip={clip} style={style} overflow="visible">
    <div style={{height: "100%", display: "flex", flexDirection: "column", fontFamily: fontFamilies.system}}>
      <div style={{padding: "12px 14px", borderRadius: headerSurface === "none" ? 0 : 12, ...surfacePanelStyle(accent, .66, headerSurface)}}>
        <TypographyLayer clip={clip} layer={0} style={{...typographyStyle(clip, "eyebrow", {fontSize: 16, fontWeight: 850, color: accent}), textTransform: "uppercase"}}>{editableValue(clip.props, ["eyebrowText"], "CASES · VERIFIED")}</TypographyLayer>
        <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 18, marginTop: 7}}>
          <TypographyLayer clip={clip} layer={1} style={{...typographyStyle(clip, "title", {fontSize: 42, fontWeight: 900, color: "#fff"}), lineHeight: 1.05}}>{highlightedText(editableValue(clip.props, ["title"], "案例依次展开"), value(clip.props, ["titleHighlightText"], ""), highlightColor)}</TypographyLayer>
          <TypographyLayer clip={clip} layer={2} align="right" style={{...typographyStyle(clip, "detail", {fontSize: 17, fontWeight: 600, color: "#aeb9c1"}), lineHeight: 1.2}}>{highlightedText(editableValue(clip.props, ["detail"], "每个案例按时间进入并保留上下文"), value(clip.props, ["detailHighlightText"], ""), highlightColor)}</TypographyLayer>
        </div>
      </div>
      <div style={{flex: 1, minHeight: 0, marginTop: 18, display: "grid", gridTemplateColumns: `repeat(${cases.length}, minmax(0,1fr))`, gap: 14}}>
        {cases.map((item, index) => {
          const progress = smootherStep(interpolate(frame, [item.appearFrame, item.appearFrame + 12], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
          const src = mediaSourceFor(assetMap, item.assetId);
          const cleanSource = src?.toLowerCase().split(/[?#]/)[0];
          const isVideoSource = Boolean(cleanSource && /\.(mp4|mov|m4v|webm)$/.test(cleanSource));
          const itemAccent = item.accentColor ?? accent;
          const itemSurface = item.surfaceStyle ?? (value(clip.props, ["surfaceStyle"], "glass") as SurfaceStyle);
          const itemTitleFontSize = boundedNumber(item.titleFontSize ?? clip.props.bodyFontSize, Math.max(16, clip.transform.height * .038), 1, 4096);
          const itemDetailFontSize = boundedNumber(item.detailFontSize ?? clip.props.caseDetailFontSize, Math.max(12, clip.transform.height * .026), 1, 4096);
          const itemHighlightColor = item.highlightColor ?? itemAccent ?? highlightColor;
          const footerPaddingY = Math.max(4, Math.min(10, itemTitleFontSize * .2));
          const footerPaddingX = Math.max(7, Math.min(12, itemTitleFontSize * .28));
          return <div key={`${index}-${item.title}`} style={{minWidth: 0, height: "100%", overflow: "hidden", display: "grid", gridTemplateRows: "minmax(0,1fr) auto", borderRadius: itemSurface === "none" ? 0 : 12, ...surfacePanelStyle(itemAccent,.66,itemSurface), opacity: progress, transform: `translateX(${(1 - progress) * 36}px) scale(${.96 + progress * .04})`}}>
            <div style={{height: "100%", minHeight: 0, position: "relative", overflow: "hidden", background: "linear-gradient(145deg,#132231,#070b11)"}}>
              {src ? isVideoSource ? <Sequence from={item.appearFrame} layout="none"><Html5Video src={src} muted style={{width: "100%", height: "100%", objectFit: "cover"}}/></Sequence> : <Img src={src} style={{width: "100%", height: "100%", objectFit: "cover"}}/> : <div style={{height: "100%", display: "grid", placeItems: "center", color: "#607382", fontSize: 16, fontWeight: 700}}>案例素材 {index + 1}</div>}
              <span style={{position: "absolute", left: 10, top: 10, padding: "4px 7px", borderRadius: 5, background: itemSurface === "none" ? "transparent" : "rgba(5,10,16,.74)", color: itemAccent, fontSize: 12, fontWeight: 900}}>{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div style={{padding: `${footerPaddingY}px ${footerPaddingX}px`}}>
              <div style={{color: item.titleColor ?? item.fontColor ?? value(clip.props, ["bodyColor"], "#fff"), fontSize: itemTitleFontSize, fontWeight: boundedNumber(clip.props.bodyFontWeight, 850, 400, 900), lineHeight: 1.12, whiteSpace: "normal", overflowWrap: "anywhere"}}>{highlightedText(item.title, item.titleHighlightText ?? "", itemHighlightColor)}</div>
              {item.detail ? <div style={{marginTop: Math.max(2, Math.min(5, itemDetailFontSize * .2)), color: item.detailColor ?? item.fontColor ?? value(clip.props, ["caseDetailColor"], "#9eacb6"), fontSize: itemDetailFontSize, fontWeight: boundedNumber(clip.props.detailFontWeight, 550, 400, 900), lineHeight: 1.15, whiteSpace: "normal", overflowWrap: "anywhere"}}>{highlightedText(item.detail, item.detailHighlightText ?? "", itemHighlightColor)}</div> : null}
            </div>
          </div>;
        })}
      </div>
    </div>
  </AnimatedClipBox>;
};

const GrowthCurve = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#46e0a0");
  const progress = interpolate(frame, [4, Math.min(58, clip.durationInFrames * .65)], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const pathLength = 720;
  return <PanelFrame clip={clip} style={style} accent="resultGold">
    <div style={{height: "100%", boxSizing: "border-box", padding: "24px 34px 26px 42px", fontFamily: fontFamilies.system, position: "relative"}}>
      <RevealedText clip={clip} style={typographyStyle(clip, "title", {color: color(style, "textSecondary", "#a9b7c6"), fontSize: Math.max(14, clip.transform.height * .048), fontWeight: 700})}>{editableValue(clip.props, ["title"], "一周 AI 收益增长")}</RevealedText>
      <svg viewBox="0 0 900 300" style={{position: "absolute", left: "5%", right: "5%", bottom: "7%", width: "90%", height: "74%", overflow: "visible"}}>
        {[60,120,180,240].map((y) => <line key={y} x1="35" y1={y} x2="865" y2={y} stroke="rgba(126,161,184,.14)" strokeWidth="2"/>) }
        <path d="M45 250 C160 252 210 224 290 214 C390 201 422 167 505 157 C605 145 660 84 845 44" fill="none" stroke={accent} strokeWidth="9" strokeLinecap="round" strokeDasharray={pathLength} strokeDashoffset={pathLength * (1 - progress)} style={{filter: `drop-shadow(0 0 12px ${accent})`}}/>
        <circle cx="845" cy="44" r={10 + progress * 4} fill={accent} opacity={progress}/>
        <circle cx="845" cy="44" r={24} fill="none" stroke={accent} strokeWidth="3" opacity={progress * .55}/>
      </svg>
      <RevealedText clip={clip} offset={12} style={{position: "absolute", right: "7%", top: "12%", ...typographyStyle(clip, "body", {color: accent, fontSize: Math.max(38, clip.transform.height * .2), fontWeight: 900}), lineHeight: 1, letterSpacing: -2, textShadow: `0 0 24px ${accent}66`}}>{editableValue(clip.props, ["valueText"], "$50,000")}</RevealedText>
      <div style={{position: "absolute", left: "8%", bottom: "5%", ...typographyStyle(clip, "detail", {color: "#6f8494", fontSize: Math.max(12, clip.transform.height * .04), fontWeight: 500})}}>{editableValue(clip.props, ["startLabel"], "起点")}</div>
      <div style={{position: "absolute", right: "7%", bottom: "5%", ...typographyStyle(clip, "detail", {color: accent, fontSize: Math.max(12, clip.transform.height * .04), fontWeight: 800})}}>{editableValue(clip.props, ["endLabel"], "结果")}</div>
    </div>
  </PanelFrame>;
};

const ZeroTimeline = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#ff646a");
  const progress = interpolate(frame, [5, Math.min(56, clip.durationInFrames * .62)], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <PanelFrame clip={clip} style={style} accent="riskRed">
    <div style={{height: "100%", boxSizing: "border-box", padding: "26px 42px", fontFamily: fontFamilies.system, display: "flex", flexDirection: "column"}}>
      <RevealedText clip={clip} style={typographyStyle(clip, "title", {color: color(style, "textPrimary", "#fff"), fontSize: Math.max(28, clip.transform.height * .13), fontWeight: 900})}>{editableValue(clip.props, ["title"], "3月—6月")}</RevealedText>
      <div style={{flex: 1, display: "flex", alignItems: "center", position: "relative", marginInline: "4%"}}>
        <div style={{position: "absolute", left: 0, right: 0, height: 4, borderRadius: 4, background: "rgba(122,161,192,.18)"}}/>
        <div style={{position: "absolute", left: 0, width: `${progress * 100}%`, height: 4, borderRadius: 4, background: accent, boxShadow: `0 0 18px ${accent}77`}}/>
        {[0,1/3,2/3,1].map((position, index) => <div key={position} style={{position: "absolute", left: `${position * 100}%`, width: 16, height: 16, marginLeft: -8, borderRadius: "50%", border: `3px solid ${position <= progress ? accent : "#3c4b58"}`, background: position <= progress ? `${accent}44` : "#0b1219", boxShadow: position <= progress ? `0 0 14px ${accent}77` : "none"}}><span style={{position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", color: position <= progress ? "#bac8d2" : "#4d6070", fontSize: Math.max(11, clip.transform.height * .036), whiteSpace: "nowrap"}}>{index === 0 ? editableValue(clip.props, ["startLabel"], "3月") : index === 3 ? editableValue(clip.props, ["endLabel"], "6月") : `${index + 3}月`}</span></div>)}
      </div>
      <RevealedText clip={clip} offset={10} style={{alignSelf: "center", marginTop: -18, padding: "8px 20px", border: `1px solid ${accent}`, borderRadius: 10, background: `${accent}18`, ...typographyStyle(clip, "body", {color: accent, fontSize: Math.max(32, clip.transform.height * .14), fontWeight: 900}), boxShadow: `0 0 24px ${accent}38`}}>{editableValue(clip.props, ["valueText"], "0 变现")}</RevealedText>
    </div>
  </PanelFrame>;
};

const FavoriteConfirm = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#e6b85c");
  const light = interpolate(frame, [5, 22], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const checked = interpolate(frame, [20, 34], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <AnimatedClipBox clip={clip} style={style}>
    <div style={{width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: fontFamilies.system}}>
      <div style={{width: "34%", aspectRatio: "1", borderRadius: "50%", display: "grid", placeItems: "center", background: `radial-gradient(circle, ${accent}${Math.round(light * 70 + 18).toString(16).padStart(2,"0")}, rgba(9,15,22,.92) 68%)`, border: `2px solid ${accent}`, boxShadow: `0 0 ${18 + light * 38}px ${accent}${Math.round(light * 120).toString(16).padStart(2,"0")}`}}>
        <svg viewBox="0 0 100 120" width="48%" height="48%"><path d="M18 10 H82 V106 L50 82 L18 106 Z" fill={light > .45 ? accent : "none"} stroke={accent} strokeWidth="9" strokeLinejoin="round"/></svg>
      </div>
      <svg viewBox="0 0 80 60" width="22%" height="18%" style={{marginTop: 8}}><path d="M8 30 L28 48 L72 10" fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="100" strokeDashoffset={100 * (1 - checked)} /></svg>
      <RevealedText clip={clip} offset={10} style={{...typographyStyle(clip, "title", {color: color(style, "textPrimary", "#fff"), fontSize: Math.max(20, clip.transform.height * .09), fontWeight: 900}), textAlign: "center"}}>{editableValue(clip.props, ["title"], "先收藏，答案含金量很高")}</RevealedText>
    </div>
  </AnimatedClipBox>;
};

const FolderIcon = ({accent, muted}: {accent: string; muted: number}) => <div style={{position: "relative", width: "100%", height: 78, marginTop: 16, borderRadius: "8px 12px 12px 12px", border: `2px solid ${muted > .5 ? "#53606b" : accent}`, background: muted > .5 ? "linear-gradient(145deg,#343d45,#1c232a)" : `linear-gradient(145deg,${accent}cc,${accent}44)`, boxShadow: muted > .5 ? "none" : `0 0 18px ${accent}55`}}><div style={{position: "absolute", left: 8, top: -13, width: "38%", height: 15, borderRadius: "7px 7px 0 0", background: muted > .5 ? "#53606b" : accent}}/></div>;

const FolderMultiply = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const count = Math.round(numeric(clip.props.folderCount, 6));
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const grayStart = numeric(clip.props.grayDelayFrames, 30) + 30;
  const gray = interpolate(frame, [grayStart, grayStart + 16], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <PanelFrame clip={clip} style={style}>
    <div style={{height: "100%", boxSizing: "border-box", padding: "24px 38px 26px 44px", fontFamily: fontFamilies.system, display: "flex", flexDirection: "column"}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}><RevealedText clip={clip} style={typographyStyle(clip, "title", {color: "#fff", fontSize: Math.max(28, clip.transform.height * .13), fontWeight: 900})}>{editableValue(clip.props, ["title"], "6 款产品")}</RevealedText><RevealedText clip={clip} offset={12} style={typographyStyle(clip, "detail", {color: gray > .4 ? "#79838c" : "#ff7b80", fontSize: Math.max(16, clip.transform.height * .06), fontWeight: 800})}>{editableValue(clip.props, ["detail"], "无一例外，全部变现失败")}</RevealedText></div>
      <div style={{flex: 1, display: "grid", gridTemplateColumns: `repeat(${Math.min(6, count)}, minmax(0, 1fr))`, alignItems: "center", gap: 16}}>{Array.from({length: count}, (_, index) => {const appearance = itemProgress(frame, index, count, 52); return <div key={index} style={{opacity: appearance, transform: `translateY(${(1 - appearance) * 25}px) scale(${.8 + appearance * .2})`, filter: `grayscale(${gray})`, minWidth: 0}}><FolderIcon accent={accent} muted={gray}/><div style={{marginTop: 10, textAlign: "center", ...typographyStyle(clip, "body", {color: gray > .5 ? "#66717a" : "#b9dce8", fontSize: Math.max(11, clip.transform.height * .04), fontWeight: 750})}}>产品 {index + 1}</div></div>;})}</div>
    </div>
  </PanelFrame>;
};

const themeAccent: Record<string, string> = {cyan: "#38d9ff", gold: "#e6b85c", purple: "#8a7dff", green: "#46e0a0", red: "#ff646a"};
const ThemedCard = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const theme = value(clip.props, ["theme"], "cyan");
  const accent = value(clip.props, ["accentColor"], themeAccent[theme] ?? "#38d9ff");
  const eyebrow = editableValue(clip.props, ["eyebrowText"], "AI · TECH CARD");
  const title = editableValue(clip.props, ["title"], "这里填写主信息");
  const titleStyle = typographyStyle(clip, "title", {
    color: color(style, "textPrimary", "#fff"),
    // Keep unset legacy cards on the same 48px value shown by the Inspector.
    // Resizing a card must not silently resize or reflow its text. An explicit
    // titleFontSize remains user-controlled; the high safety ceiling only guards malformed data.
    fontSize: 48,
    fontWeight: 900,
  });
  return <PanelFrame clip={clip} style={style}>
    <div style={{position: "relative", height: "100%", boxSizing: "border-box", padding: "30px 42px 30px 50px", display: "flex", flexDirection: "column", justifyContent: "center", fontFamily: fontFamilies.system, background: `radial-gradient(circle at 86% 18%, ${accent}26, transparent 34%)`}}>
      <div style={{position: "absolute", right: 26, top: 24, width: 54, height: 54, border: `1px solid ${accent}88`, transform: "rotate(45deg)", boxShadow: `0 0 26px ${accent}44`}}/>
      {eyebrow ? <RevealedText clip={clip} style={{...typographyStyle(clip, "eyebrow", {color: accent, fontSize: 20, fontWeight: 850}), letterSpacing: 3}}>{eyebrow}</RevealedText> : null}
      <RevealedText clip={clip} offset={4} style={{marginTop: eyebrow ? 10 : 0, ...titleStyle, lineHeight: 1.08, whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "normal"}}>{title}</RevealedText>
      <RevealedText clip={clip} offset={8} style={{marginTop: 14, ...typographyStyle(clip, "detail", {color: color(style, "textSecondary", "#a9b7c6"), fontSize: 22, fontWeight: 650}), lineHeight: 1.38}}>{editableValue(clip.props, ["detail"], "这里填写补充说明或证据口径")}</RevealedText>
    </div>
  </PanelFrame>;
};

const tableRows = (source: unknown): string[][] => Array.isArray(source) ? source.filter(Array.isArray).map((row) => row.map(String)).slice(0, 6) : [];
const DataTable = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const columns = simpleStrings(clip.props.columns, ["模块", "作用", "状态"], 4);
  const parsedRows = tableRows(clip.props.rows).filter((row) => row.length === columns.length);
  const rows = parsedRows.length ? parsedRows : [["需求判断", "确认真实痛点", "已完成"], ["AI 交付", "填平技术空缺", "进行中"]];
  const stagger = numeric(clip.props.rowStaggerFrames, 6);
  return <PanelFrame clip={clip} style={style}>
    <div style={{height: "100%", boxSizing: "border-box", padding: "22px 34px 26px 42px", display: "flex", flexDirection: "column", fontFamily: fontFamilies.system}}>
      <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 18}}><RevealedText clip={clip} style={typographyStyle(clip, "title", {color: "#fff", fontSize: Math.max(26, clip.transform.height * .1), fontWeight: 900})}>{editableValue(clip.props, ["title"], "科技信息列表")}</RevealedText><RevealedText clip={clip} offset={5} style={typographyStyle(clip, "detail", {color: "#718898", fontSize: Math.max(12, clip.transform.height * .04), fontWeight: 500})}>{editableValue(clip.props, ["detail"], "可编辑标题、表头与每一行内容")}</RevealedText></div>
      <div style={{marginTop: 16, flex: 1, display: "grid", gridTemplateRows: `repeat(${rows.length + 1}, minmax(0,1fr))`, border: "1px solid rgba(122,161,192,.22)", borderRadius: 10, overflow: "hidden"}}>
        <div style={{display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))`, background: `${accent}1d`}}>{columns.map((item) => <div key={item} style={{display: "flex", alignItems: "center", paddingInline: 15, borderRight: "1px solid rgba(122,161,192,.18)", ...typographyStyle(clip, "body", {color: accent, fontSize: Math.max(13, clip.transform.height * .043), fontWeight: 850})}}>{item}</div>)}</div>
        {rows.map((row, rowIndex) => {const progress = revealProgress(clip, frame, 8 + rowIndex * stagger); return <div key={rowIndex} style={{display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))`, opacity: progress, transform: `translateX(${(1 - progress) * 26}px)`, borderTop: "1px solid rgba(122,161,192,.12)", background: rowIndex % 2 ? "rgba(9,16,23,.76)" : "rgba(14,23,32,.76)"}}>{row.map((item, columnIndex) => <div key={`${columnIndex}-${item}`} style={{display: "flex", alignItems: "center", paddingInline: 15, borderRight: "1px solid rgba(122,161,192,.12)", ...typographyStyle(clip, "body", {color: columnIndex === 0 ? "#fff" : "#a4b5c1", fontSize: Math.max(12, clip.transform.height * .041), fontWeight: columnIndex === 0 ? 750 : 550})}}>{item}</div>)}</div>;})}
      </div>
    </div>
  </PanelFrame>;
};

type ProgressivePoint = {text: string; appearFrame: number; fontColor?: string; accentColor?: string; fontSize?: number; highlightText?: string; highlightColor?: string};
const progressivePointItems = (source: unknown): ProgressivePoint[] => Array.isArray(source) ? source.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item, index) => ({
  text: String(item.text ?? `观点 ${index + 1}`),
  appearFrame: Math.max(0, Number(item.appearFrame ?? 12 + index * 60)),
  ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
  ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
  ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
  ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
  ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
})).slice(0, 5) : [];
const progressiveFontFamilies: Record<string, string> = {
  system: fontFamilies.system!,
  pingfang: "'PingFang SC', -apple-system, sans-serif",
  heiti: "'Heiti SC', 'PingFang SC', sans-serif",
  songti: "'Songti SC', 'STSong', serif",
  kaiti: "'Kaiti SC', 'STKaiti', serif",
  rounded: "'Hiragino Maru Gothic ProN', 'PingFang SC', sans-serif",
};
const ProgressivePoints = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const borderColor = value(clip.props, ["borderColor"], accent);
  const parsed = progressivePointItems(clip.props.points);
  const points = parsed.length ? parsed : [{text: "先判断真实需求", appearFrame: 12}, {text: "再选择 AI 交付方式", appearFrame: 72}, {text: "最后验证是否有人付费", appearFrame: 132}];
  const animation = value(clip.props, ["textAnimation"], "slide-right");
  const fontFamily = progressiveFontFamilies[value(clip.props, ["pointFontFamily"], "system")] ?? progressiveFontFamilies.system;
  const pointFontSize = Math.max(12, Math.min(4096, Number(clip.props.pointFontSize ?? Math.max(17, clip.transform.height * .058))));
  const pointFontWeight = Math.max(400, Math.min(900, Number(clip.props.pointFontWeight ?? 800)));
  const pointFontColor = value(clip.props, ["pointFontColor", "bodyColor"], color(style, "textPrimary", "#fff"));
  const pointAppearance = surfaceAppearance(clip, borderColor, {radius: 10});
  const title = editableValue(clip.props, ["title"], "");
  const detail = editableValue(clip.props, ["detail"], "");
  const hasHeader = Boolean(title || detail);
  return <AnimatedClipBox clip={clip} style={style}>
    <div style={{height: "100%", boxSizing: "border-box", padding: "8px 12px 12px", display: "flex", flexDirection: "column", fontFamily, background: "transparent"}}>
      {hasHeader ? <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 18}}>{title ? <RevealedText clip={clip} style={typographyStyle(clip, "title", {color: "#fff", fontSize: Math.max(26, clip.transform.height * .1), fontWeight: 900})}>{title}</RevealedText> : null}{detail ? <RevealedText clip={clip} offset={4} style={{maxWidth: "48%", ...typographyStyle(clip, "detail", {color: "#718898", fontSize: Math.max(12, clip.transform.height * .04), fontWeight: 500}), textAlign: "right"}}>{detail}</RevealedText> : null}</div> : null}
      <div style={{position: "relative", flex: 1, minHeight: 0, marginTop: hasHeader ? 12 : 0, display: "grid", gridTemplateRows: `repeat(${points.length}, minmax(0, 1fr))`, gap: 8}}>
        {points.map((point, index) => {
          const progress = interpolate(frame, [point.appearFrame, point.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
          const visibleText = animation === "typewriter" ? point.text.slice(0, Math.ceil(point.text.length * progress)) : point.text;
          const transform = animation === "scale-in" ? `scale(${.78 + progress * .22})` : animation === "fade-up" ? `translateY(${(1 - progress) * 18}px)` : `translateX(${(1 - progress) * 30}px)`;
          const itemAccent = point.accentColor ?? borderColor;
          const itemFontColor = point.fontColor ?? pointFontColor;
          return <div key={`${index}-${point.text}`} style={{position: "relative", zIndex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `${Math.max(38, clip.transform.height * .11)}px minmax(0,1fr)`, alignItems: "center", gap: 14, opacity: progress, transform, transformOrigin: "left center"}}>
            <div style={{width: Math.max(34, clip.transform.height * .1), height: Math.max(34, clip.transform.height * .1), borderRadius: "50%", display: "grid", placeItems: "center", border: `2px solid ${itemAccent}`, background: `radial-gradient(circle at 36% 28%,rgba(255,255,255,.24),${hexRgba(itemAccent, .28)} 32%,rgba(8,15,22,.72) 76%)`, backdropFilter: "blur(14px) saturate(150%)", WebkitBackdropFilter: "blur(14px) saturate(150%)", boxShadow: `0 0 ${10 + progress * 16}px ${hexRgba(itemAccent, .58)}, inset 0 1px 0 rgba(255,255,255,.2)`, color: itemAccent, fontSize: Math.max(14, clip.transform.height * .045), fontWeight: 900}}>{index + 1}</div>
            <div style={{
              height: "72%",
              minHeight: 34,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              padding: "7px 18px",
              ...pointAppearance,
              borderColor: itemAccent,
              background: `linear-gradient(90deg,${hexRgba(itemAccent, .14)},transparent 42%),${String(pointAppearance.background ?? "rgba(7,17,27,.76)")}`,
              boxShadow: `${String(pointAppearance.boxShadow ?? "")}, inset 3px 0 ${itemAccent}`,
              color: itemFontColor,
              fontSize: point.fontSize ?? pointFontSize,
              lineHeight: 1.25,
              fontWeight: pointFontWeight,
            }}>{highlightedText(visibleText, point.highlightText ?? "", point.highlightColor ?? itemAccent)}</div>
          </div>;
        })}
      </div>
    </div>
  </AnimatedClipBox>;
};

const VerticalProgressivePoints = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const borderColor = value(clip.props, ["borderColor"], accent);
  const parsed = progressivePointItems(clip.props.points);
  const points = parsed.length ? parsed : [{text: "客户分析", appearFrame: 12}, {text: "补货订单", appearFrame: 72}, {text: "挨店统计", appearFrame: 132}];
  const animation = value(clip.props, ["textAnimation"], "fade-up");
  const fontFamily = progressiveFontFamilies[value(clip.props, ["pointFontFamily"], "system")] ?? progressiveFontFamilies.system;
  const pointFontSize = boundedNumber(clip.props.pointFontSize, Math.max(18, clip.transform.height * .06), 12, 4096);
  const pointFontWeight = boundedNumber(clip.props.pointFontWeight, 800, 400, 900);
  const pointFontColor = value(clip.props, ["pointFontColor", "bodyColor"], color(style, "textPrimary", "#fff"));
  const title = editableValue(clip.props, ["title"], "");
  const detail = editableValue(clip.props, ["detail"], "");
  const hasHeader = Boolean(title || detail);
  const cardAppearance = surfaceAppearance(clip, borderColor, {radius: 16});
  return <AnimatedClipBox clip={clip} style={style}>
    <div style={{...cardAppearance, height: "100%", boxSizing: "border-box", padding: "30px 34px", display: "flex", flexDirection: "column", fontFamily, overflow: "hidden"}}>
      {hasHeader ? <div>{title ? <RevealedText clip={clip} style={typographyStyle(clip, "title", {color: "#fff", fontSize: Math.max(26, clip.transform.height * .08), fontWeight: 900})}>{title}</RevealedText> : null}{detail ? <RevealedText clip={clip} offset={4} style={{marginTop: 8, ...typographyStyle(clip, "detail", {color: "#a7b5bf", fontSize: Math.max(13, clip.transform.height * .034), fontWeight: 550}), lineHeight: 1.4}}>{detail}</RevealedText> : null}</div> : null}
      <div style={{flex: 1, minHeight: 0, marginTop: hasHeader ? 22 : 0, display: "grid", gridTemplateRows: `repeat(${points.length}, minmax(0, 1fr))`, alignItems: "center"}}>
        {points.map((point, index) => {
          const progress = interpolate(frame, [point.appearFrame, point.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
          const visibleText = animation === "typewriter" ? point.text.slice(0, Math.ceil(point.text.length * progress)) : point.text;
          const transform = animation === "scale-in" ? `scale(${.86 + progress * .14})` : animation === "slide-right" ? `translateX(${(1 - progress) * 28}px)` : `translateY(${(1 - progress) * 18}px)`;
          const itemAccent = point.accentColor ?? (index === 0 ? accent : borderColor);
          const itemFontColor = point.fontColor ?? pointFontColor;
          return <div key={`${index}-${point.text}`} style={{position: "relative", minHeight: 0, display: "flex", alignItems: "center", paddingLeft: 22, opacity: progress, transform, transformOrigin: "left center"}}>
            <div style={{position: "absolute", left: 0, top: "24%", bottom: "24%", width: 4, borderRadius: 4, background: itemAccent, boxShadow: `0 0 12px ${hexRgba(itemAccent, .58)}`}}/>
            <div style={{color: itemFontColor, fontSize: point.fontSize ?? pointFontSize, fontWeight: pointFontWeight, lineHeight: 1.22, textAlign: "left", overflowWrap: "anywhere", textShadow: "0 2px 14px rgba(0,0,0,.62)"}}>{highlightedText(visibleText, point.highlightText ?? "", point.highlightColor ?? itemAccent)}</div>
          </div>;
        })}
      </div>
    </div>
  </AnimatedClipBox>;
};

const SaasNetwork = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#38d9ff");
  const people = simpleStrings(clip.props.peopleLabels, ["同行 A", "同行 B", "同行 C"], 3);
  const peopleStyles = motionSlotStylesFor(clip, "peopleLabels");
  return <PanelFrame clip={clip} style={style}>
    <div style={{height: "100%", boxSizing: "border-box", padding: "22px 36px 24px 42px", fontFamily: fontFamilies.system, position: "relative"}}>
      <RevealedText clip={clip} style={{position: "absolute", top: "10%", left: "35%", width: "30%", padding: "14px 12px", border: `1px solid ${accent}`, borderRadius: 12, background: `${accent}1c`, boxShadow: `0 0 24px ${accent}33`, ...typographyStyle(clip, "title", {color: "#fff", fontSize: Math.max(20, clip.transform.height * .09), fontWeight: 900}), textAlign: "center"}}>{editableValue(clip.props, ["title"], "SaaS 平台")}</RevealedText>
      <svg viewBox="0 0 900 430" style={{position: "absolute", inset: "24% 7% 12%", width: "86%", height: "64%"}}>{[180,450,720].map((x,index) => {const progress = interpolate(frame, [14 + index * 10, 34 + index * 10], [0,1], {extrapolateLeft:"clamp",extrapolateRight:"clamp"}); return <path key={x} d={`M450 22 C450 112 ${x} 98 ${x} 250`} fill="none" stroke={accent} strokeWidth="5" strokeDasharray="300" strokeDashoffset={300 * (1 - progress)} style={{filter:`drop-shadow(0 0 8px ${accent})`}}/>;})}</svg>
      <div style={{position: "absolute", left: "7%", right: "7%", bottom: "8%", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 24}}>{people.map((person,index) => {
        const slot = peopleStyles[index] ?? {};
        const progress = typeof slot.appearFrame === "number"
          ? interpolate(frame, [slot.appearFrame, slot.appearFrame + 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})
          : revealProgress(clip,frame,22+index*10);
        const slotAccent = slot.accentColor ?? slot.highlightColor ?? accent;
        const slotFontColor = slot.fontColor ?? "#dbe8ef";
        const slotFontSize = slot.fontSize ?? Math.max(13,clip.transform.height*.045);
        return <div key={person} style={{display:"flex",flexDirection:"column",alignItems:"center",opacity:progress,transform:`scale(${.75+progress*.25})`}}><div style={{width: Math.max(44,clip.transform.height*.17),height: Math.max(44,clip.transform.height*.17),borderRadius:"50%",background:`linear-gradient(160deg,${slotAccent}bb,#203142)`,border:`2px solid ${slotAccent}`,position:"relative",boxShadow:`0 0 18px ${slotAccent}44`}}><div style={{position:"absolute",left:"18%",right:"18%",bottom:"-28%",height:"48%",borderRadius:"50% 50% 12px 12px",background:`${slotAccent}55`,border:`1px solid ${slotAccent}`}}/></div><div style={{marginTop:18,...typographyStyle(clip, "body", {color:slotFontColor,fontSize:slotFontSize,fontWeight:800})}}>{highlightedText(person, slot.highlightText ?? "", slot.highlightColor ?? slotAccent)}</div></div>;
      })}</div>
    </div>
  </PanelFrame>;
};

const AiConvergence = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const frame = useCurrentFrame();
  const accent = value(clip.props, ["accentColor"], "#8a7dff");
  const bundledLogoFiles = ["deepseek.svg", "google.svg", "hailuo.svg", "higress.svg", "jimeng.svg", "jina.svg", "lambda.svg", "llamaindex.svg", "luma.svg", "mistral.svg", "notebooklm.svg", "notion.svg", "nplcloud.svg", "ollama.svg", "perplexity.svg", "qwen.svg"];
  const configuredLogoFiles = simpleStrings(clip.props.logoFiles, [], 16).filter((file) => /^[a-z0-9._-]+\.(png|jpe?g|webp|svg)$/i.test(file));
  const logoFiles = configuredLogoFiles.length ? configuredLogoFiles : bundledLogoFiles;
  const tileCount = Math.round(boundedNumber(clip.props.tileCount, 30, 12, 36));
  const assembleFrames = Math.round(boundedNumber(clip.props.assembleFrames, 46, 12, 120));
  const rotationSpeed = boundedNumber(clip.props.rotationSpeed, .28, -2, 2);
  const sphereSize = boundedNumber(clip.props.sphereSize, 78, 45, 100) / 100;
  const tileSize = boundedNumber(clip.props.tileSize, 100, 50, 140) / 100;
  const dissolveFrame = numeric(clip.props.dissolveFrame, 126);
  const dissolve = smootherStep(interpolate(frame, [dissolveFrame, dissolveFrame + 24], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const rotation = frame * rotationSpeed * Math.PI / 180;
  // Remotion Player scales the composition canvas. Pixel-sized children inside a
  // transformed clip can therefore be enlarged twice in preview. Keeping each
  // card proportional to the clip width makes Player and render agree.
  const tileWidthPercent = 4.2 * tileSize;
  return <AnimatedClipBox clip={clip} style={style}>
    <div data-ai-logo-sphere style={{width: "100%", height: "100%", position: "relative", perspective: 900, transformStyle: "preserve-3d", fontFamily: fontFamilies.system}}>
      <div style={{position: "absolute", left: "50%", top: "47%", width: `${52 * sphereSize}%`, aspectRatio: "1", transform: "translate(-50%,-50%)", borderRadius: "50%", background: `radial-gradient(circle,${hexRgba(accent, .13)} 0%,${hexRgba(accent, .045)} 42%,transparent 72%)`, filter: `drop-shadow(0 0 34px ${hexRgba(accent, .22)})`, opacity: (1 - dissolve) * .85}}/>
      {Array.from({length: tileCount}, (_, index) => {
        const logoFile = logoFiles.length ? logoFiles[index % logoFiles.length] : undefined;
        const vertical = tileCount === 1 ? 0 : 1 - (2 * index) / (tileCount - 1);
        const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
        const theta = goldenAngle * index + rotation;
        const sphereX = Math.cos(theta) * radial;
        const sphereZ = Math.sin(theta) * radial;
        const depth = (sphereZ + 1) / 2;
        const targetX = 50 + sphereX * 31 * sphereSize;
        const targetY = 47 + vertical * 39 * sphereSize;
        const revealStart = 3 + Math.round((index % 8) * 2.2 + Math.floor(index / 8) * 3);
        const reveal = smootherStep(interpolate(frame, [revealStart, Math.min(assembleFrames, revealStart + 18)], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
        const x = 50 + (targetX - 50) * reveal + sphereX * dissolve * 12;
        const y = 47 + (targetY - 47) * reveal + vertical * dissolve * 12;
        const depthScale = .56 + depth * .54;
        const revealOvershoot = 1 + Math.sin(reveal * Math.PI) * .08;
        const scale = depthScale * (.18 + reveal * .82) * revealOvershoot * (1 - dissolve * .42);
        const opacity = reveal * (.48 + depth * .52) * (1 - dissolve);
        return <div key={`${logoFile ?? "logo"}-${index}`} data-ai-logo-tile={index} data-ai-logo-depth={depth.toFixed(3)} data-ai-logo-file={logoFile} style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: `${tileWidthPercent}%`,
          aspectRatio: "1",
          transform: `translate(-50%,-50%) scale(${scale}) rotate(${dissolve * (index % 2 ? 16 : -16)}deg)`,
          transformOrigin: "50% 50%",
          opacity,
          zIndex: 20 + Math.round(depth * 100),
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          boxSizing: "border-box",
          padding: 0,
          borderRadius: "18%",
          border: `1px solid rgba(255,255,255,${.55 + depth * .38})`,
          background: "linear-gradient(145deg,rgba(255,255,255,.99),rgba(238,240,244,.94))",
          boxShadow: `0 ${3 + depth * 7}px ${10 + depth * 14}px rgba(0,0,0,${.2 + depth * .22}),0 0 ${7 + depth * 9}px ${hexRgba(accent, .1 + depth * .16)}`,
          color: "#111722",
          backfaceVisibility: "hidden",
          willChange: "transform, opacity",
        }}>
          {logoFile ? <Img
            src={staticFile(`assets/ai-logo-sphere/${logoFile}`)}
            style={{position: "absolute", inset: "18%", width: "64%", height: "64%", display: "block", objectFit: "contain"}}
          /> : null}
        </div>;
      })}
    </div>
  </AnimatedClipBox>;
};

const CaptionPanel = ({clip, style}: {clip: Clip; style: StyleProfile}) => {
  const variant = value(clip.props,["variant"],"glass");
  const accent = value(clip.props,["accentColor"],variant === "gold" ? "#e6b85c" : "#38d9ff");
  const variants: Record<string,CSSProperties> = {
    glass:{background:"linear-gradient(135deg,rgba(18,30,42,.82),rgba(7,12,18,.7))",border:"1px solid rgba(142,215,255,.32)",backdropFilter:"blur(12px)",boxShadow:"0 12px 34px rgba(0,0,0,.35)"},
    neon:{background:"rgba(5,10,17,.9)",border:`2px solid ${accent}`,boxShadow:`0 0 22px ${accent}66, inset 0 0 20px ${accent}14`},
    console:{background:"rgba(5,12,17,.94)",border:"1px solid rgba(56,217,255,.32)",boxShadow:"inset 5px 0 #38d9ff"},
    gold:{background:"linear-gradient(100deg,rgba(32,26,15,.94),rgba(10,14,19,.9))",border:"1px solid rgba(230,184,92,.48)",boxShadow:"inset 5px 0 #e6b85c, 0 8px 28px rgba(0,0,0,.34)"},
    minimal:{background:"linear-gradient(90deg,transparent,rgba(4,7,10,.82) 12%,rgba(4,7,10,.82) 88%,transparent)",borderBottom:`2px solid ${accent}`},
  };
  const detail = editableValue(clip.props,["detail"],"");
  const selectedSurface = typeof clip.props.surfaceStyle === "string" ? surfaceAppearance(clip, value(clip.props, ["borderColor"], accent), {radius: variant === "minimal" ? 0 : 12}) : (variants[variant] ?? variants.glass);
  return <AnimatedClipBox clip={clip} style={style}><div style={{width:"100%",height:"100%",boxSizing:"border-box",borderRadius:variant === "minimal" ? 0 : 12,padding:"12px 22px",display:"flex",alignItems:"center",gap:14,fontFamily:"-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",...selectedSurface}}><div style={{width:6,alignSelf:"stretch",borderRadius:5,background:accent,boxShadow:`0 0 12px ${accent}`}}/><div style={{minWidth:0,flex:1}}><RevealedText clip={clip} style={{...typographyStyle(clip, "title", {color:"#fff",fontSize:Math.max(22,clip.transform.height*.3),fontWeight:900}),lineHeight:1.15,textShadow:"0 2px 12px rgba(0,0,0,.8)"}}>{editableValue(clip.props,["title","text"],"这里填写字幕重点")}</RevealedText>{detail ? <RevealedText clip={clip} offset={5} style={{marginTop:4,...typographyStyle(clip, "detail", {color:"#9eb0bd",fontSize:Math.max(12,clip.transform.height*.15),fontWeight:600}),lineHeight:1.2}}>{detail}</RevealedText>:null}</div></div></AnimatedClipBox>;
};

type NarrativeItem = {label: string; text: string; appearFrame: number; accentColor?: string; fontColor?: string; surfaceStyle?: SurfaceStyle; fontSize?: number; highlightText?: string; highlightColor?: string};
type NarrativeGroup = {title: string; items: string[]; appearFrame: number; accentColor?: string; fontColor?: string; surfaceStyle?: SurfaceStyle; fontSize?: number; highlightText?: string; highlightColor?: string};
type NarrativeMetric = {label: string; value: string; appearFrame: number; accentColor?: string; fontColor?: string; surfaceStyle?: SurfaceStyle; fontSize?: number; highlightText?: string; highlightColor?: string};

const narrativeItems = (source: unknown, fallback: string[], maximum = 10): NarrativeItem[] => {
  const raw = Array.isArray(source) ? source : fallback;
  return raw.slice(0, maximum).map((item, index) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return {
        label: String(record.label ?? ""),
        text: String(record.text ?? `内容 ${index + 1}`),
        appearFrame: Math.max(0, Number(record.appearFrame ?? 10 + index * 24)),
        ...(typeof record.accentColor === "string" ? {accentColor: record.accentColor} : {}),
        ...(typeof record.fontColor === "string" ? {fontColor: record.fontColor} : {}),
        ...(typeof record.surfaceStyle === "string" ? {surfaceStyle: record.surfaceStyle as SurfaceStyle} : {}),
        ...(Number.isFinite(Number(record.fontSize)) ? {fontSize: Math.max(1, Number(record.fontSize))} : {}),
        ...(typeof record.highlightText === "string" ? {highlightText: record.highlightText} : {}),
        ...(typeof record.highlightColor === "string" ? {highlightColor: record.highlightColor} : {}),
      };
    }
    const [label = "", ...copy] = String(item).split(/[｜|]/);
    return {
      label: copy.length ? label.trim() : "",
      text: (copy.length ? copy.join("｜") : label).trim(),
      appearFrame: 10 + index * 24,
    };
  }).filter((item) => Boolean(item.label || item.text));
};

const narrativeGroups = (source: unknown): NarrativeGroup[] => {
  if (!Array.isArray(source)) return [];
  return source
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => ({
      title: String(item.title ?? `分组 ${index + 1}`),
      items: Array.isArray(item.items) ? item.items.map(String).slice(0, 5) : [],
      appearFrame: Math.max(0, Number(item.appearFrame ?? 10 + index * 30)),
      ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
      ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
      ...(typeof item.surfaceStyle === "string" ? {surfaceStyle: item.surfaceStyle as SurfaceStyle} : {}),
      ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
      ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
      ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
    }))
    .slice(0, 4);
};

const narrativeMetrics = (source: unknown): NarrativeMetric[] => {
  if (!Array.isArray(source)) return [];
  return source
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => ({
      label: String(item.label ?? `指标 ${index + 1}`),
      value: String(item.value ?? "0"),
      appearFrame: Math.max(0, Number(item.appearFrame ?? 10 + index * 30)),
      ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
      ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
      ...(typeof item.surfaceStyle === "string" ? {surfaceStyle: item.surfaceStyle as SurfaceStyle} : {}),
      ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
      ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
      ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
    }))
    .slice(0, 4);
};

const splitNarrativeItem = (source: NarrativeItem): [string, string] => [source.label.trim(), source.text.trim()];

const RemotionBrandMark = ({size}: {size: number}) => (
  <svg aria-label="Remotion" width={size} height={size} viewBox="0 0 410 425" fill="none" xmlns="http://www.w3.org/2000/svg" style={{display: "block", flex: "0 0 auto"}}>
    <path d="M92.3905 0.603638C83.5124 1.08554 76.358 2.49417 69.1481 5.2373C65.5523 6.59033 59.6583 9.53735 56.4148 11.5762C42.8474 20.0836 32.5051 32.8724 27.1115 47.7558C26.0365 50.7028 23.1266 60.0998 21.2546 66.5684C8.78078 109.81 1.70055 157.092 0.180713 207.135C-0.0602375 215.105 -0.0602375 234.084 0.180713 241.925C1.20012 275.102 4.36954 305.053 10.1153 335.599C12.4506 347.961 16.1946 364.568 18.3632 372.112C22.793 387.44 31.8379 400.488 44.7009 410.052C53.3195 416.465 63.1058 420.765 73.9485 422.878C79.1753 423.897 86.0702 424.361 91.1487 424.027C98.1733 423.564 112.111 421.692 123.436 419.672C174.48 410.571 221.632 394.279 264.392 370.963C291.471 356.19 314.621 340.195 336.955 320.789C359.215 301.476 378.194 280.699 394.894 257.382C398.768 251.989 400.714 248.838 402.66 244.872C407.665 234.64 410.018 224.465 410 213.085C410 202.483 407.998 193.067 403.68 183.429C401.604 178.777 399.62 175.441 395.172 169.102C378.788 145.767 360.605 125.434 338.438 105.676C304.074 75.0573 263.261 49.9428 217.685 31.3526C207.806 27.3306 198.075 23.7905 186.361 19.9538C161.562 11.8542 130.868 4.82956 104.901 1.32651C100.824 0.770477 95.2819 0.455353 92.3905 0.603638Z" fill="#0B84F3" fillOpacity={0.1}/>
    <path d="M116.44 45.697C109.454 46.0762 103.824 47.1846 98.1503 49.3432C95.3208 50.4079 90.6828 52.7269 88.1304 54.3313C77.4543 61.0258 69.3159 71.0894 65.0717 82.8011C64.2257 85.1201 61.9359 92.5146 60.4628 97.6048C50.6472 131.631 45.0757 168.838 43.8798 208.217C43.6901 214.488 43.6901 229.423 43.8798 235.593C44.6819 261.7 47.1759 285.269 51.6973 309.305C53.535 319.033 56.4811 332.101 58.1876 338.037C61.6734 350.099 68.7908 360.367 78.9128 367.893C85.6948 372.939 93.3956 376.323 101.928 377.986C106.041 378.788 111.466 379.152 115.463 378.89C120.99 378.525 131.958 377.052 140.87 375.462C181.036 368.301 218.141 355.481 251.788 337.133C273.097 325.509 291.313 312.922 308.888 297.652C326.405 282.454 341.34 266.105 354.481 247.757C357.529 243.512 359.06 241.033 360.592 237.912C364.53 229.861 366.382 221.854 366.367 212.899C366.367 204.556 364.792 197.147 361.394 189.563C359.76 185.902 358.2 183.277 354.699 178.289C341.806 159.926 327.498 143.927 310.055 128.379C283.014 104.285 250.898 84.5221 215.034 69.8934C207.26 66.7285 199.603 63.9427 190.385 60.9237C170.871 54.55 146.718 49.0224 126.285 46.2658C123.076 45.8282 118.715 45.5803 116.44 45.697Z" fill="#0B84F3" fillOpacity={0.2}/>
    <path d="M141.332 92.4681C136.307 92.7408 132.259 93.5379 128.179 95.0902C126.144 95.8559 122.809 97.5236 120.973 98.6774C113.295 103.492 107.443 110.729 104.391 119.151C103.782 120.819 102.136 126.137 101.076 129.797C94.0174 154.267 90.0107 181.023 89.1506 209.343C89.0143 213.853 89.0143 224.593 89.1506 229.03C89.7275 247.804 91.5211 264.754 94.7725 282.039C96.0941 289.035 98.2128 298.433 99.44 302.702C101.947 311.376 107.065 318.76 114.344 324.172C119.221 327.801 124.759 330.235 130.895 331.43C133.853 332.007 137.755 332.269 140.629 332.081C144.604 331.818 152.491 330.759 158.9 329.616C187.786 324.466 214.469 315.246 238.666 302.052C253.99 293.692 267.09 284.641 279.729 273.659C292.326 262.73 303.066 250.972 312.516 237.777C314.708 234.725 315.81 232.942 316.911 230.698C319.743 224.908 321.075 219.15 321.064 212.71C321.064 206.71 319.932 201.382 317.488 195.928C316.313 193.295 315.191 191.407 312.674 187.82C303.402 174.615 293.112 163.109 280.568 151.928C261.122 134.601 238.026 120.389 212.235 109.869C206.644 107.593 201.138 105.589 194.509 103.418C180.475 98.8347 163.106 94.8595 148.411 92.8771C146.104 92.5625 142.968 92.3842 141.332 92.4681Z" fill="#0B84F3"/>
  </svg>
);

const HyperFramesBrandMark = ({size}: {size: number}) => (
  <svg aria-label="HyperFrames" width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" style={{display: "block", flex: "0 0 auto"}}>
    <defs>
      <linearGradient id="hyperframes-left" x1="82" y1="346" x2="250" y2="104" gradientUnits="userSpaceOnUse"><stop stopColor="#45DD69"/><stop offset="1" stopColor="#13D1E4"/></linearGradient>
      <linearGradient id="hyperframes-right" x1="427" y1="135" x2="278" y2="371" gradientUnits="userSpaceOnUse"><stop stopColor="#45DD69"/><stop offset="1" stopColor="#13D1E4"/></linearGradient>
    </defs>
    <path d="M241.5 98.7C258.3 89.1 271.7 103.6 267.3 123.5L216.5 352.7C210.5 379.9 183.8 389.9 161.6 373.4L54.3 293.7C29.8 275.5 28.9 244.3 51.7 223.6L241.5 98.7Z" fill="url(#hyperframes-left)"/>
    <path d="M331.5 97.6C343.2 89.9 356.5 95.4 369.4 105.3L462.2 217.9C489.2 237.7 490.4 263.4 464.8 283.3L286.6 379.1C267.3 389.5 250.1 375.7 254.5 354.4L303.5 123.7C307.9 102.9 319.1 96.9 331.5 97.6Z" fill="url(#hyperframes-right)"/>
  </svg>
);

const narrativeMediaNode = (src: string | undefined): ReactNode => {
  if (!src) return <div style={{width: "100%", height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(145deg,#142331,#080d13)", color: "#718493", fontSize: 20, fontWeight: 750}}>选择图片或视频素材</div>;
  const cleanSource = src.toLowerCase().split(/[?#]/)[0];
  return /\.(mp4|mov|m4v|webm)$/.test(cleanSource ?? "")
    ? <Html5Video src={src} muted volume={0} pauseWhenBuffering={false} style={{display: "block", width: "100%", height: "100%", objectFit: "contain"}}/>
    : <Img src={src} style={{display: "block", width: "100%", height: "100%", objectFit: "contain"}}/>;
};

const TemplateClip = ({clip, style, src, assetMap}: {clip: Clip; style: StyleProfile; src: string | undefined; assetMap: Record<string, string>}) => {
  const id = clip.componentId ?? "ajiunotes.tech.side-card";
  const title = editableValue(clip.props, ["title", "text", "label"], id.split(".").at(-1) ?? "信息卡");
  const detail = editableValue(clip.props, ["detail", "purpose", "subtitle", "value"], "AI 可视化编导台");

  if (id.endsWith("typography.section-lockup")) return <TypographySectionLockup clip={clip} style={style}/>;
  if (id.endsWith("typography.logo-title")) return <TypographyLogoTitle clip={clip} style={style} src={src}/>;
  if (id.endsWith("typography.hero-focus")) return <TypographyHeroFocus clip={clip} style={style}/>;
  if (id.endsWith("typography.focus-stack")) return <TypographyFocusStack clip={clip} style={style}/>;
  if (id.endsWith("typography.profile-proof")) return <TypographyProfileProof clip={clip} style={style} src={src}/>;
  if (id.endsWith("typography.case-gallery")) return <TypographyCaseGallery clip={clip} style={style} assetMap={assetMap}/>;
  if (id.endsWith("process-flow")) return <ProcessFlow clip={clip} style={style}/>;
  if (id.endsWith("module-grid")) return <ModuleGrid clip={clip} style={style}/>;
  if (id.endsWith("data-formula")) return <DataFormula clip={clip} style={style}/>;
  if (id.endsWith("growth-curve")) return <GrowthCurve clip={clip} style={style}/>;
  if (id.endsWith("zero-timeline")) return <ZeroTimeline clip={clip} style={style}/>;
  if (id.endsWith("favorite-confirm")) return <FavoriteConfirm clip={clip} style={style}/>;
  if (id.endsWith("folder-multiply")) return <FolderMultiply clip={clip} style={style}/>;
  if (id.endsWith("themed-card")) return <ThemedCard clip={clip} style={style}/>;
  if (id.endsWith("data-table")) return <DataTable clip={clip} style={style}/>;
  if (id.endsWith("vertical-progressive-points")) return <VerticalProgressivePoints clip={clip} style={style}/>;
  if (id.endsWith("progressive-points")) return <ProgressivePoints clip={clip} style={style}/>;
  if (id.endsWith("saas-network")) return <SaasNetwork clip={clip} style={style}/>;
  if (id.endsWith("ai-convergence")) return <AiConvergence clip={clip} style={style}/>;
  if (id.endsWith("caption-panel")) return <CaptionPanel clip={clip} style={style}/>;

  if (id.endsWith("proof-frame") || id.endsWith("demo-focus")) {
    const cleanSource = src?.toLowerCase().split(/[?#]/)[0];
    const isVideoSource = Boolean(cleanSource && /\.(mp4|mov|m4v|webm)$/.test(cleanSource));
    return (
      <AnimatedClipBox clip={clip} style={style} overflow="visible">
        <MaterialSurface clip={clip}>
          {src ? isVideoSource ? <Html5Video src={src} muted startFrom={clip.sourceInFrames} pauseWhenBuffering={false} style={{display: "block", width: "100%", height: "100%", objectFit: "fill"}} /> : <Img src={src} style={{display: "block", width: "100%", height: "100%", objectFit: "fill"}} /> : clip.id === "motion-candidate-preview" ? <AbsoluteFill style={{alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 42%, rgba(56,217,255,.18), transparent 36%), linear-gradient(135deg, rgba(14,25,37,.96), rgba(6,10,15,.98))", color: color(style, "textSecondary", "#A9B7C6"), fontFamily: fontFamilies.system, fontSize: 24, fontWeight: 700, letterSpacing: 2}}>候选占位 · 正式使用时选择证明或演示素材</AbsoluteFill> : <MissingAsset label={clip.assetId ?? clip.id} style={style} />}
          {clip.props.showLabel === true ? <div style={{position: "absolute", left: 18, top: 18, ...typographyStyle(clip, "body", {color: color(style, "resultGold", "#E6B85C"), fontSize: 22, fontWeight: 800}), background: "rgba(7,10,15,.76)", padding: "8px 14px", borderRadius: 10}}>{editableValue(clip.props, ["labelText"], `EVIDENCE · ${title}`)}</div> : null}
        </MaterialSurface>
      </AnimatedClipBox>
    );
  }

  const accent = id.includes("risk") ? "riskRed" : id.includes("result") || id.includes("verdict") ? "resultGold" : "statusCyan";
  const eyebrow = editableValue(clip.props, ["eyebrowText"], "AI · VERIFIED");
  return (
    <PanelFrame clip={clip} style={style} accent={accent}>
      <div style={{height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "34px 42px 34px 50px", boxSizing: "border-box", fontFamily: fontFamilies.system}}>
        {eyebrow ? <div style={{...typographyStyle(clip, "eyebrow", {fontSize: Math.max(24, clip.transform.height * 0.1), color: color(style, accent, "#38D9FF"), fontWeight: 700}), letterSpacing: 4}}>{eyebrow}</div> : null}
        {title ? <div style={{...typographyStyle(clip, "title", {fontSize: Math.max(38, clip.transform.height * 0.23), color: color(style, "textPrimary", "#fff"), fontWeight: 900}), lineHeight: 1.1, marginTop: eyebrow ? 12 : 0}}>{title}</div> : null}
        {detail ? <div style={{...typographyStyle(clip, "detail", {fontSize: Math.max(20, clip.transform.height * 0.085), color: color(style, "textSecondary", "#A9B7C6"), fontWeight: 600}), marginTop: 16}}>{detail}</div> : null}
      </div>
    </PanelFrame>
  );
};

const MediaClip = ({clip, style, src, focusClips, canvasWidth, canvasHeight}: {clip: Clip; style: StyleProfile; src: string | undefined; focusClips: Clip[]; canvasWidth: number; canvasHeight: number}) => {
  const localFrame = useCurrentFrame();
  const isBaseAroll = clip.type === "video" && clip.transform.zIndex === 0 && clip.props.recording !== true;
  const absoluteFrame = clip.from + localFrame;
  const focusClip = isBaseAroll ? focusClips.find((candidate) => absoluteFrame >= candidate.from && absoluteFrame < candidate.from + candidate.durationInFrames) : undefined;
  let displayClip = clip;
  if (focusClip) {
    const transitionFrames = boundedNumber(focusClip.props.focusTransitionFrames, 24, 6, 45);
    const focusEndFrame = focusClip.from + focusClip.durationInFrames - 1;
    const enterProgress = interpolate(absoluteFrame, [focusClip.from, Math.min(focusEndFrame, focusClip.from + transitionFrames)], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
    const exitProgress = interpolate(absoluteFrame, [Math.max(focusClip.from, focusEndFrame - transitionFrames), focusEndFrame], [1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
    const progress = smootherStep(Math.min(enterProgress, exitProgress));
    const circle = focusClip.props.pipShape === "circle";
    const targetWidth = circle ? Math.round(canvasHeight * .25) : Math.round(canvasWidth * .27);
    const targetHeight = circle ? targetWidth : Math.round(targetWidth * 9 / 16);
    const targetX = canvasWidth - targetWidth - Math.round(canvasWidth * .035);
    const targetY = canvasHeight - targetHeight - Math.round(canvasHeight * .05);
    displayClip = {
      ...clip,
      transform: {
        ...clip.transform,
        x: interpolate(progress, [0, 1], [clip.transform.x, targetX]),
        y: interpolate(progress, [0, 1], [clip.transform.y, targetY]),
        width: interpolate(progress, [0, 1], [clip.transform.width, targetWidth]),
        height: interpolate(progress, [0, 1], [clip.transform.height, targetHeight]),
        zIndex: 200,
      },
      props: {
        ...clip.props,
        materialSurfaceMode: "edge-glass",
        edgeFadeMode: "none",
        borderColor: value(focusClip.props, ["borderColor", "accentColor"], "#38d9ff"),
        glassBorderWidth: Number(focusClip.props.glassBorderWidth ?? 12),
        glassBorderGlow: Number(focusClip.props.glassBorderGlow ?? 70),
        focusPipProgress: progress,
        focusPipShape: circle ? "circle" : "rounded-rect",
        fit: circle ? "cover" : "fill",
      },
    };
  }
  if (!src) return <AnimatedClipBox clip={displayClip} style={style}><MissingAsset label={clip.assetId ?? clip.id} style={style} /></AnimatedClipBox>;
  if (clip.type === "video") {
    const VideoComponent = clip.props.importedMaterial === true ? Html5Video : OffthreadVideo;
    const media = <MaterialSurface clip={displayClip}>
        <VideoComponent
          src={src}
          startFrom={clip.sourceInFrames}
          pauseWhenBuffering={clip.props.importedMaterial !== true}
          style={{display: "block", width: "100%", height: "100%", objectFit: value(displayClip.props, ["fit"], "fill") as "cover" | "contain" | "fill"}}
        />
        {typeof clip.props.overlayText === "string" && clip.props.overlayText.trim() ? <div style={{position: "absolute", left: 18, right: 18, bottom: 18, padding: "10px 14px", borderLeft: `4px solid ${value(clip.props, ["accentColor"], "#38d9ff")}`, borderRadius: 8, background: "rgba(7,10,15,.82)", ...typographyStyle(clip, "body", {color: "white", fontSize: Math.max(20, displayClip.transform.height * .05), fontWeight: 800}), lineHeight: 1.25, boxShadow: "0 8px 28px rgba(0,0,0,.38)"}}>{clip.props.overlayText}</div> : null}
      </MaterialSurface>;
    return typeof displayClip.props.enterPreset === "string" ? <AnimatedClipBox clip={displayClip} style={style} overflow="visible">{media}</AnimatedClipBox> : <StaticClipBox clip={displayClip} overflow="visible">{media}</StaticClipBox>;
  }
  return <AnimatedClipBox clip={displayClip} style={style} overflow="visible"><MaterialSurface clip={displayClip}><Img src={src} style={{display: "block", width: "100%", height: "100%", objectFit: value(displayClip.props, ["fit"], "fill") as "cover" | "contain" | "fill"}} /></MaterialSurface></AnimatedClipBox>;
};

const resolveSource = (assetId: string | undefined, assetMap: Record<string, string>): string | undefined => {
  if (!assetId) return undefined;
  const path = assetMap[assetId];
  return path ? staticFile(path) : undefined;
};

const CardPopupSfx = ({clip}: {clip: Clip}) => {
  if (!supportsCardSfx(clip.componentId)) return null;
  const presetId = resolveCardSfxPresetId(clip.id, clip.props.cardSfxPreset);
  if (presetId === "none") return null;
  const preset = getCardSfxPreset(presetId);
  const userVolume = boundedNumber(clip.props.cardSfxVolume, 10, 0, 100) / 100;
  if (userVolume <= 0) return null;
  return <Audio src={staticFile(preset.path)} volume={userVolume * preset.gain}/>;
};

const isVideoSource = (src: string | undefined): boolean => {
  const cleanSource = src?.toLowerCase().split(/[?#]/)[0];
  return Boolean(cleanSource && /\.(mp4|mov|m4v|webm)$/.test(cleanSource));
};

const resolvePremountFrames = (clip: Clip, input: EditorInputProps): number => {
  const src = resolveSource(clip.assetId, input.assetMap);
  if (clip.type === "template" && supportsCardSfx(clip.componentId) && resolveCardSfxPresetId(clip.id, clip.props.cardSfxPreset) !== "none") {
    return Math.min(clip.from, input.project.settings.fps * 2);
  }
  if (!src || clip.type === "audio") return 0;

  // Support materials are intentionally mounted well before they appear. The
  // editor also prefetches these small proxies as Blob URLs, so image decoding
  // and the first video GOP do not interrupt the already-playing A-roll.
  const isPrimaryAroll = Boolean(clip.assetId && (/^asset-original-\d+$/.test(clip.assetId) || clip.assetId === "asset-raw-video"));
  const seconds = isPrimaryAroll ? 2 : isVideoSource(src) || clip.type === "video" ? 8 : 5;
  return Math.min(clip.from, input.project.settings.fps * seconds);
};

const preserveFocusedMaterialAspect = (clip: Clip, input: EditorInputProps): Clip => {
  if (clip.props.fullScreenFocus !== true) return clip;
  const material = clip.type === "image" || clip.type === "video" || clip.componentId?.endsWith("proof-frame") || clip.componentId?.endsWith("demo-focus");
  if (!material) return clip;
  const asset = clip.assetId ? input.project.assets.find((item) => item.id === clip.assetId) : undefined;
  const restoreTransform = clip.props.focusRestoreTransform;
  const restoreRatio = restoreTransform && typeof restoreTransform === "object" && !Array.isArray(restoreTransform)
    ? Number((restoreTransform as Record<string, unknown>).width) / Math.max(1, Number((restoreTransform as Record<string, unknown>).height))
    : clip.transform.width / Math.max(1, clip.transform.height);
  const sourceRatio = asset?.width && asset.height ? asset.width / asset.height : restoreRatio;
  const canvasWidth = input.project.settings.width;
  const canvasHeight = input.project.settings.height;
  const canvasRatio = canvasWidth / canvasHeight;
  const width = sourceRatio >= canvasRatio ? canvasWidth : canvasHeight * sourceRatio;
  const height = sourceRatio >= canvasRatio ? canvasWidth / sourceRatio : canvasHeight;
  return {
    ...clip,
    transform: {...clip.transform, x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height, scale: 1, rotation: 0},
    props: {...clip.props, fit: "fill"},
  };
};

const renderClip = (clip: Clip, track: Track, input: EditorInputProps, focusClips: Clip[]) => {
  const displayClip = preserveFocusedMaterialAspect(clip, input);
  const src = resolveSource(displayClip.assetId, input.assetMap);
  if (!clip.enabled || !track.enabled) return null;
  if (displayClip.type === "caption") return <Caption clip={displayClip} style={input.styleProfile} />;
  if (displayClip.type === "template") return <TemplateClip clip={displayClip} style={input.styleProfile} src={src} assetMap={input.assetMap} />;
  if (displayClip.type === "audio") return null;
  return <MediaClip clip={displayClip} style={input.styleProfile} src={src} focusClips={focusClips} canvasWidth={input.project.settings.width} canvasHeight={input.project.settings.height}/>;
};

export const EditorComposition = (input: EditorInputProps) => {
  const tracks = new Map(input.project.tracks.map((track) => [track.id, track]));
  const seamlessAroll = matchingSeamlessArollAsset(input.project);
  const seamlessArollAvailable = Boolean(seamlessAroll && input.assetMap[seamlessAroll.id]);
  const sourceClips = seamlessArollAvailable
    ? input.project.clips.filter((clip) => !(clip.type === "video" && clip.trackId === "track-main-video"))
    : input.project.clips;
  const seamlessClip: Clip | undefined = seamlessArollAvailable && seamlessAroll ? {
    id: `clip-${seamlessAroll.id}`,
    type: "video",
    trackId: "track-main-video",
    from: 0,
    durationInFrames: input.project.settings.durationInFrames,
    sourceInFrames: 0,
    assetId: seamlessAroll.id,
    props: {fit: "cover", seamlessAroll: true},
    transform: {
      x: 0,
      y: 0,
      width: input.project.settings.width,
      height: input.project.settings.height,
      scale: 1,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
    },
    enabled: true,
    origin: {kind: "manual", sourceId: seamlessAroll.id},
  } : undefined;
  const clips = [...(seamlessClip ? [seamlessClip] : []), ...sourceClips].sort((a, b) => a.transform.zIndex - b.transform.zIndex || a.from - b.from);
  const focusedClips = clips.filter((clip) => clip.enabled && clip.props.fullScreenFocus === true && Boolean(tracks.get(clip.trackId)?.enabled));
  return (
    <AbsoluteFill style={{backgroundColor: color(input.styleProfile, "canvas", "#070A0F"), overflow: "hidden"}}>
      <TechGrid style={input.styleProfile} />
      {clips.map((clip) => {
        const track = tracks.get(clip.trackId);
        if (!track) return null;
        // Video-backed clips must exist before their first visible frame in the
        // Player. This includes evidence/demo templates, not only A-roll. Without
        // premounting, opening the template's first video GOP can briefly stall an
        // already-playing main video even though the timeline itself is continuous.
        const premountFor = resolvePremountFrames(clip, input);
        return (
          <Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames} name={clip.id} premountFor={premountFor}>
            {renderClip(clip, track, input, focusedClips)}
            <CardPopupSfx clip={clip}/>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
