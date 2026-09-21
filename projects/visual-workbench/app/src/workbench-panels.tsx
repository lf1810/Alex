import {useEffect, useRef, useState} from "react";
import {CARD_SFX_PRESETS, getCardSfxPreset, isCardSfxPresetId, resolveCardSfxPresetId, supportsCardSfx} from "@ajiunotes/contracts";
import type {Asset, Clip, MotionPreset, ProjectDocument, ShotNode, TemplateDefinition, Track} from "@ajiunotes/contracts";
import {fitClipToAssetAspect, isClipWithinSafeArea, updateCardSfx, updateClipProps} from "@ajiunotes/editor-core";
import {api, type RecordingSummary} from "./api";
import {FilmIcon, SlidersIcon, SparkIcon} from "./icons";
import {createCommunityMotionPresets} from "./community-motion-presets";

const typeLabel: Record<Clip["type"], string> = {video: "视频", image: "图片", audio: "音频", caption: "字幕", template: "动效"};

export const motionName = (preset: string) => ({
  "tech-slide-right": "科技右滑",
  "tech-slide-up": "科技上浮",
  "tech-slide-scale": "科技滑入放大",
  "spring-scale-in": "弹性放大",
  "focus-expand": "聚焦展开",
  "split-reveal": "分栏揭示",
  "caption-fade": "字幕淡入",
  "warning-pulse-in": "警示脉冲",
}[preset] ?? preset);

export const templateName = (componentId: string) => ({
  "ajiunotes.tech.caption": "科技字幕",
  "ajiunotes.tech.result-card": "结果大数字卡片",
  "ajiunotes.tech.verdict-card": "最终结论卡片",
  "ajiunotes.tech.proof-frame": "证据素材重点放大",
  "ajiunotes.tech.demo-focus": "案例放大＋口播缩角",
  "ajiunotes.tech.side-card": "侧边科技信息卡",
  "ajiunotes.tech.chapter-card": "章节转场卡片",
  "ajiunotes.tech.comparison-card": "左右对比卡片",
  "ajiunotes.tech.step-cards": "步骤递进卡片",
  "ajiunotes.tech.risk-card": "风险警示脉冲卡片",
  "ajiunotes.tech.process-flow": "流程推进线",
  "ajiunotes.tech.module-grid": "多模块能力网格",
  "ajiunotes.tech.data-formula": "数字公式递进",
  "ajiunotes.tech.growth-curve": "增长曲线与金额结果",
  "ajiunotes.tech.zero-timeline": "零变现时间趋势线",
  "ajiunotes.tech.favorite-confirm": "收藏点亮确认",
  "ajiunotes.tech.folder-multiply": "文件夹复制后变灰",
  "ajiunotes.tech.themed-card": "多主题科技文字卡",
  "ajiunotes.tech.data-table": "可编辑科技列表表格",
  "ajiunotes.tech.progressive-points": "观点逐条展开",
  "ajiunotes.tech.vertical-progressive-points": "竖向观点依次弹出",
  "ajiunotes.tech.saas-network": "SaaS连接三位人物",
  "ajiunotes.tech.ai-convergence": "AI工具Logo球汇聚",
  "ajiunotes.tech.caption-panel": "科技字幕背景",
  "ajiunotes.typography.section-lockup": "左上栏目文字锁定",
  "ajiunotes.typography.logo-title": "Logo与标题分层出现",
  "ajiunotes.typography.hero-focus": "中央关键词聚焦",
  "ajiunotes.typography.focus-stack": "观点接力自动变暗",
  "ajiunotes.typography.profile-proof": "人物履历与案例分屏",
  "ajiunotes.typography.case-gallery": "多案例依次排开",
}[componentId] ?? componentId.split(".").at(-1) ?? componentId);

const templateDescription = (componentId: string) => ({
  "ajiunotes.tech.caption": "底部字幕淡入，可修改文字与颜色",
  "ajiunotes.tech.result-card": "用于开头金额、结果和大数字冲击",
  "ajiunotes.tech.verdict-card": "用于核心判断或结尾结论收束",
  "ajiunotes.tech.proof-frame": "放大截图或录屏，突出证据关键区域",
  "ajiunotes.tech.demo-focus": "人物缩到角落，案例画面成为主体",
  "ajiunotes.tech.side-card": "从侧边滑入的解释、状态或补充信息",
  "ajiunotes.tech.chapter-card": "章节切换、观点转折与段落标题",
  "ajiunotes.tech.comparison-card": "两个方案、前后结果或错误正确对照",
  "ajiunotes.tech.step-cards": "方法步骤依次出现并推进",
  "ajiunotes.tech.risk-card": "反常识、错误做法或风险提示",
  "ajiunotes.tech.process-flow": "多步骤流程随时间依次点亮",
  "ajiunotes.tech.module-grid": "同时展示多个功能或能力模块",
  "ajiunotes.tech.data-formula": "数字、运算过程与最终结果递进",
  "ajiunotes.tech.growth-curve": "曲线由低到高生长，并显示可编辑金额",
  "ajiunotes.tech.zero-timeline": "长时间线逐段推进，最终显示零变现",
  "ajiunotes.tech.favorite-confirm": "收藏图标点亮为金色，并绘制确认对号",
  "ajiunotes.tech.folder-multiply": "一个文件夹扩展成多个，一秒后逐渐变灰",
  "ajiunotes.tech.themed-card": "青蓝、金色、紫色、绿色和红色科技文字卡",
  "ajiunotes.tech.data-table": "表头、行列和文字出现节奏均可编辑",
  "ajiunotes.tech.progressive-points": "1–5 个观点按各自设定时间依次出现",
  "ajiunotes.tech.vertical-progressive-points": "单张卡片内，1–5 行内容纵向依次出现",
  "ajiunotes.tech.saas-network": "平台依次连接三个人物节点",
  "ajiunotes.tech.ai-convergence": "AI Logo 逐个补位，组成带景深和旋转感的球形阵列",
  "ajiunotes.tech.caption-panel": "玻璃、霓虹、控制台、金色和极简字幕底板",
  "ajiunotes.typography.section-lockup": "短竖线、英文眉题、中文标题和说明逐层揭示",
  "ajiunotes.typography.logo-title": "Logo 聚焦后，标题层级按顺序进入",
  "ajiunotes.typography.hero-focus": "用超大关键词、短线和英文眉题收束观点",
  "ajiunotes.typography.focus-stack": "新观点接管焦点，已讲完观点保留并自动降亮度",
  "ajiunotes.typography.profile-proof": "人物或项目履历在一侧递进，案例素材在另一侧丝滑进入",
  "ajiunotes.typography.case-gallery": "一到四个案例按设定时间依次展开并保留上下文",
}[componentId] ?? "可信Remotion动效组件");

const projectAssetName = (asset: Asset) => {
  const original = /^(?:asset-original-|source-)(\d+)$/.exec(asset.id);
  if (original) return `口播原片 ${String(Number(original[1])).padStart(2, "0")}`;
  return decodeURIComponent(asset.sourcePath.split("/").at(-1) ?? asset.id).replace(/\.[^.]+$/, "").replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " ");
};

export type MotionDesignSeed = {template: TemplateDefinition; preset?: MotionPreset};
export type MotionDesignDraft = {
  name: string;
  componentId: string;
  templateVersion: string;
  title: string;
  detail: string;
  accentColor: string;
  enterPreset: string;
  durationInFrames: number;
  assetId?: string;
  extraProps: Record<string, unknown>;
  defaultTransform: {x: number; y: number; width: number; height: number; scale: number; rotation: number; opacity: number};
};

const defaultTransform = (componentId: string, project: ProjectDocument): MotionDesignDraft["defaultTransform"] => {
  const {width, height, orientation} = project.settings;
  if (componentId.endsWith("typography.section-lockup")) return orientation === "horizontal" ? {x: width * .045, y: height * .055, width: width * .33, height: height * .18, scale: 1, rotation: 0, opacity: 1} : {x: width * .07, y: height * .09, width: width * .72, height: height * .12, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("typography.logo-title")) return orientation === "horizontal" ? {x: width * .07, y: height * .2, width: width * .47, height: height * .28, scale: 1, rotation: 0, opacity: 1} : {x: width * .08, y: height * .24, width: width * .84, height: height * .2, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("typography.hero-focus")) return orientation === "horizontal" ? {x: width * .2, y: height * .28, width: width * .6, height: height * .28, scale: 1, rotation: 0, opacity: 1} : {x: width * .08, y: height * .34, width: width * .84, height: height * .2, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("typography.focus-stack")) return orientation === "horizontal" ? {x: width * .08, y: height * .18, width: width * .84, height: height * .52, scale: 1, rotation: 0, opacity: 1} : {x: width * .06, y: height * .22, width: width * .88, height: height * .42, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("typography.profile-proof")) return orientation === "horizontal" ? {x: width * .04, y: height * .09, width: width * .92, height: height * .68, scale: 1, rotation: 0, opacity: 1} : {x: width * .05, y: height * .18, width: width * .9, height: height * .5, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("typography.case-gallery")) return orientation === "horizontal" ? {x: width * .06, y: height * .14, width: width * .88, height: height * .58, scale: 1, rotation: 0, opacity: 1} : {x: width * .05, y: height * .22, width: width * .9, height: height * .42, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("caption")) return {x: width * .13, y: height * .84, width: width * .74, height: height * .1, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("process-flow")) return orientation === "horizontal" ? {x: width * .1, y: height * .2, width: width * .8, height: height * .46, scale: 1, rotation: 0, opacity: 1} : {x: width * .06, y: height * .25, width: width * .88, height: height * .38, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("module-grid")) return orientation === "horizontal" ? {x: width * .1, y: height * .12, width: width * .8, height: height * .62, scale: 1, rotation: 0, opacity: 1} : {x: width * .06, y: height * .18, width: width * .88, height: height * .56, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("data-formula")) return orientation === "horizontal" ? {x: width * .08, y: height * .2, width: width * .84, height: height * .46, scale: 1, rotation: 0, opacity: 1} : {x: width * .05, y: height * .26, width: width * .9, height: height * .4, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("caption-panel")) return orientation === "horizontal" ? {x: width * .14, y: height * .78, width: width * .72, height: height * .12, scale: 1, rotation: 0, opacity: 1} : {x: width * .06, y: height * .78, width: width * .88, height: height * .1, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("vertical-progressive-points")) return orientation === "horizontal" ? {x: width * .06, y: height * .12, width: width * .34, height: height * .62, scale: 1, rotation: 0, opacity: 1} : {x: width * .08, y: height * .2, width: width * .84, height: height * .42, scale: 1, rotation: 0, opacity: 1};
  if (["growth-curve", "zero-timeline", "folder-multiply", "data-table", "progressive-points", "saas-network", "ai-convergence"].some((suffix) => componentId.endsWith(suffix))) return orientation === "horizontal" ? {x: width * .1, y: height * .16, width: width * .8, height: height * .55, scale: 1, rotation: 0, opacity: 1} : {x: width * .06, y: height * .22, width: width * .88, height: height * .45, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("favorite-confirm")) return orientation === "horizontal" ? {x: width * .36, y: height * .18, width: width * .28, height: height * .52, scale: 1, rotation: 0, opacity: 1} : {x: width * .2, y: height * .23, width: width * .6, height: height * .42, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("themed-card")) return orientation === "horizontal" ? {x: width * .25, y: height * .2, width: width * .5, height: height * .42, scale: 1, rotation: 0, opacity: 1} : {x: width * .08, y: height * .27, width: width * .84, height: height * .28, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("proof-frame") || componentId.endsWith("demo-focus") || componentId.endsWith("comparison-card")) return orientation === "horizontal" ? {x: width * .125, y: height * .1, width: width * .75, height: height * .75, scale: 1, rotation: 0, opacity: 1} : {x: width * .07, y: height * .22, width: width * .86, height: height * .5, scale: 1, rotation: 0, opacity: 1};
  if (componentId.endsWith("side-card")) return orientation === "horizontal" ? {x: width * .56, y: height * .17, width: width * .38, height: height * .39, scale: 1, rotation: 0, opacity: 1} : {x: width * .1, y: height * .2, width: width * .8, height: height * .28, scale: 1, rotation: 0, opacity: 1};
  return {x: width * .23, y: height * .25, width: width * .54, height: height * .36, scale: 1, rotation: 0, opacity: 1};
};

const stringArray = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
const structuredArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
const parseSteps = (source: string) => source.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
const parseModules = (source: string) => source.split(/\r?\n/).map((line) => line.split("|").map((item) => item.trim())).filter(([title, detail]) => Boolean(title && detail)).slice(0, 6).map(([title, detail]) => ({title, detail}));
const parseTerms = (source: string) => source.split(/\r?\n/).map((line) => line.split("|").map((item) => item.trim())).filter(([label, termValue]) => Boolean(label && termValue)).slice(0, 5).map(([label, termValue, operator]) => ({label, value: termValue, ...(operator ? {operator} : {})}));
const serializeModules = (value: unknown) => structuredArray(value).map((item) => `${String(item.title ?? "")} | ${String(item.detail ?? "")}`).join("\n");
const serializeTerms = (value: unknown) => structuredArray(value).map((item) => `${String(item.label ?? "")} | ${String(item.value ?? "")}${item.operator ? ` | ${String(item.operator)}` : ""}`).join("\n");
const parseFlatItems = (source: string, maximum = 8) => source.split(/\r?\n|,|，/).map((item) => item.trim()).filter(Boolean).slice(0, maximum);
const tableColumns = (value: unknown) => {
  const columns = stringArray(value).slice(0, 4);
  return columns.length >= 2 ? columns : ["模块", "作用", "状态"];
};
const tableRows = (value: unknown, columnCount: number) => {
  if (!Array.isArray(value)) return [["需求判断", "确认真实痛点", "已完成"].slice(0, columnCount)];
  const rows = value.filter(Array.isArray).slice(0, 6).map((row) => Array.from({length: columnCount}, (_, index) => String(row[index] ?? `内容 ${index + 1}`)));
  return rows.length ? rows : [Array.from({length: columnCount}, (_, index) => `内容 ${index + 1}`)];
};
const resizeTable = (columns: string[], rows: string[][], nextColumnCount: number, nextRowCount = rows.length) => {
  const resizedColumns = Array.from({length: nextColumnCount}, (_, index) => columns[index] ?? `表头 ${index + 1}`);
  const resizedRows = Array.from({length: nextRowCount}, (_, rowIndex) => Array.from({length: nextColumnCount}, (_, columnIndex) => rows[rowIndex]?.[columnIndex] ?? `内容 ${rowIndex + 1}-${columnIndex + 1}`));
  return {columns: resizedColumns, rows: resizedRows};
};
type ProgressivePoint = {
  text: string;
  appearFrame: number;
  fontColor?: string;
  accentColor?: string;
  logoText?: string;
  highlightText?: string;
  fontSize?: number;
  surfaceStyle?: string;
};
const progressivePoints = (value: unknown): ProgressivePoint[] => {
  const items = structuredArray(value).slice(0, 5).map((item, index) => ({
    text: String(item.text ?? `观点 ${index + 1}`),
    appearFrame: Number.isInteger(item.appearFrame) ? Number(item.appearFrame) : 12 + index * 60,
    ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
    ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
    ...(typeof item.logoText === "string" ? {logoText: item.logoText} : {}),
    ...(typeof item.highlightText === "string" ? {highlightText: item.highlightText} : {}),
    ...(Number.isFinite(Number(item.fontSize)) ? {fontSize: Math.max(1, Number(item.fontSize))} : {}),
    ...(typeof item.surfaceStyle === "string" ? {surfaceStyle: item.surfaceStyle} : {}),
  }));
  return items.length ? items : [{text: "观点 1", appearFrame: 12}];
};
const resizeProgressivePoints = (points: ProgressivePoint[], count: number, gapFrames: number) => Array.from({length: count}, (_, index) => points[index] ?? {
  text: `观点 ${index + 1}`,
  appearFrame: index === 0 ? 12 : Math.max(12, points[index - 1]?.appearFrame ?? 12) + gapFrames,
  fontColor: "#ffffff",
  accentColor: "#38d9ff",
});
type EditableTypographyCase = {
  title: string;
  detail: string;
  appearFrame: number;
  assetId?: string;
  fontColor?: string;
  accentColor?: string;
  surfaceStyle?: string;
  titleFontSize?: number;
  detailFontSize?: number;
  titleColor?: string;
  detailColor?: string;
  titleHighlightText?: string;
  detailHighlightText?: string;
  highlightColor?: string;
};
const typographyCases = (value: unknown): EditableTypographyCase[] => {
  const items = structuredArray(value).slice(0, 6).map((item, index) => ({
    title: String(item.title ?? `案例 ${index + 1}`),
    detail: String(item.detail ?? ""),
    appearFrame: Number.isFinite(Number(item.appearFrame)) ? Math.max(0, Math.round(Number(item.appearFrame))) : 10 + index * 35,
    ...(typeof item.assetId === "string" && item.assetId ? {assetId: item.assetId} : {}),
    ...(typeof item.fontColor === "string" ? {fontColor: item.fontColor} : {}),
    ...(typeof item.accentColor === "string" ? {accentColor: item.accentColor} : {}),
    ...(typeof item.surfaceStyle === "string" ? {surfaceStyle: item.surfaceStyle} : {}),
    ...(Number.isFinite(Number(item.titleFontSize)) ? {titleFontSize: Math.max(1, Number(item.titleFontSize))} : {}),
    ...(Number.isFinite(Number(item.detailFontSize)) ? {detailFontSize: Math.max(1, Number(item.detailFontSize))} : {}),
    ...(typeof item.titleColor === "string" ? {titleColor: item.titleColor} : {}),
    ...(typeof item.detailColor === "string" ? {detailColor: item.detailColor} : {}),
    ...(typeof item.titleHighlightText === "string" ? {titleHighlightText: item.titleHighlightText} : {}),
    ...(typeof item.detailHighlightText === "string" ? {detailHighlightText: item.detailHighlightText} : {}),
    ...(typeof item.highlightColor === "string" ? {highlightColor: item.highlightColor} : {}),
  }));
  return items.length ? items : [{title: "案例一", detail: "问题与结果", appearFrame: 10}];
};
const resizeTypographyCases = (cases: EditableTypographyCase[], count: number, gapFrames: number): EditableTypographyCase[] =>
  Array.from({length: count}, (_, index) => cases[index] ?? {
    title: `案例${["一", "二", "三", "四", "五", "六"][index] ?? index + 1}`,
    detail: "问题与结果",
    appearFrame: index === 0 ? 10 : Math.max(10, cases[index - 1]?.appearFrame ?? 10) + gapFrames,
  });
const updateOptionalAsset = <T extends {assetId?: string}>(item: T, assetId: string): T => {
  const next = {...item};
  if (assetId) next.assetId = assetId;
  else delete next.assetId;
  return next;
};
const updateClipAsset = (clip: Clip, assetId: string): Clip => updateOptionalAsset(clip, assetId);
const textAnimations = ["fade-up", "typewriter", "scale-in", "slide-right", "mask-rise", "tracking-expand", "word-pop"];
const textAnimationName = (value: string) => ({
  "fade-up": "淡入上浮",
  "typewriter": "逐字出现",
  "scale-in": "缩放出现",
  "slide-right": "右滑进入",
  "mask-rise": "遮罩上揭",
  "tracking-expand": "字距收束",
  "word-pop": "关键词聚焦",
}[value] ?? value);
const progressiveFontOptions = [
  {value: "system", label: "系统默认"},
  {value: "pingfang", label: "苹方"},
  {value: "heiti", label: "黑体"},
  {value: "songti", label: "宋体"},
  {value: "kaiti", label: "楷体"},
  {value: "rounded", label: "圆体"},
];
const surfaceStyleOptions = [
  {value: "none", label: "无背景（仅保留文字）"},
  {value: "glass", label: "毛玻璃科技"},
  {value: "tech-transparent", label: "科技透明网格"},
  {value: "deep-solid", label: "深色实心卡片"},
  {value: "neon-outline", label: "霓虹线框卡片"},
  {value: "gradient-panel", label: "强调色渐变卡片"},
];
const gradientDirectionOptions = [
  {value: "left-solid", label: "左侧实色 → 右侧虚色"},
  {value: "right-solid", label: "右侧实色 → 左侧虚色"},
  {value: "uniform", label: "左右一致"},
];
const fontWeightOptions = [
  {value: 400, label: "常规"},
  {value: 500, label: "中等"},
  {value: 600, label: "半粗"},
  {value: 700, label: "粗体"},
  {value: 800, label: "加粗"},
  {value: 900, label: "特粗"},
];

type EditableTypographyRole = "eyebrow" | "title" | "detail" | "body";
const typographyRoleDefaults: Record<EditableTypographyRole, {label: string; fontSize: number; fontWeight: number; color: string}> = {
  eyebrow: {label: "顶部标识", fontSize: 20, fontWeight: 800, color: "#38d9ff"},
  title: {label: "主文字", fontSize: 48, fontWeight: 900, color: "#ffffff"},
  detail: {label: "说明文字", fontSize: 22, fontWeight: 600, color: "#a9b7c6"},
  body: {label: "内容文字", fontSize: 26, fontWeight: 700, color: "#ffffff"},
};

const TypographyControls = ({clip, disabled, roles, onUpdate}: {clip: Clip; disabled: boolean; roles: EditableTypographyRole[]; onUpdate: (clip: Clip, action: string) => void}) => {
  const change = (role: EditableTypographyRole, props: Record<string, unknown>, action: string) => onUpdate(updateClipProps(clip, props), `${action}${typographyRoleDefaults[role].label}`);
  return <div className="inspector-section typography-controls">
    <h3>文字样式</h3>
    <p className="structured-editor-note">主文字、说明、顶部标识和素材说明分别设置；清空内容后对应文字不会渲染。</p>
    {roles.map((role) => {
      const defaults = typographyRoleDefaults[role];
      const sizeKey = `${role}FontSize`;
      const weightKey = `${role}FontWeight`;
      const colorKey = `${role}Color`;
      const familyKey = `${role}FontFamily`;
      return <div className="typography-role-editor" key={role}>
        <strong>{defaults.label}</strong>
        <div className="field-grid">
          <label><span>字号</span><input disabled={disabled} type="number" min={1} step={1} key={`${clip.id}-${sizeKey}-${String(clip.props[sizeKey] ?? defaults.fontSize)}`} defaultValue={Number(clip.props[sizeKey] ?? defaults.fontSize)} onBlur={(event) => {const value = Number(event.currentTarget.value); if (Number.isFinite(value)) change(role, {[sizeKey]: Math.max(1, Math.round(value))}, "修改");}}/></label>
          <label><span>字重</span><select disabled={disabled} value={Number(clip.props[weightKey] ?? defaults.fontWeight)} onChange={(event) => change(role, {[weightKey]: Number(event.currentTarget.value)}, "修改")}>{fontWeightOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        <div className="field-grid">
          <label><span>颜色</span><input disabled={disabled} type="color" value={String(clip.props[colorKey] ?? defaults.color)} onChange={(event) => change(role, {[colorKey]: event.currentTarget.value}, "修改")}/></label>
          <label><span>字体</span><select disabled={disabled} value={String(clip.props[familyKey] ?? "system")} onChange={(event) => change(role, {[familyKey]: event.currentTarget.value}, "修改")}>{progressiveFontOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
      </div>;
    })}
  </div>;
};

let activeCardSfxPreview: HTMLAudioElement | undefined;

const CardSfxControls = ({clip, disabled, onUpdate}: {clip: Clip; disabled: boolean; onUpdate: (clip: Clip, action: string) => void}) => {
  const selectedPreset = isCardSfxPresetId(clip.props.cardSfxPreset) ? clip.props.cardSfxPreset : "auto";
  const [volume, setVolume] = useState(Math.max(0, Math.min(100, Number(clip.props.cardSfxVolume ?? 10))));
  useEffect(() => {
    setVolume(Math.max(0, Math.min(100, Number(clip.props.cardSfxVolume ?? 10))));
  }, [clip.id, clip.props.cardSfxVolume]);
  const resolvedPresetId = resolveCardSfxPresetId(clip.id, selectedPreset);
  const resolvedPreset = resolvedPresetId === "none" ? undefined : getCardSfxPreset(resolvedPresetId);
  const commitVolume = () => {
    const next = Math.round(Math.max(0, Math.min(100, volume)));
    if (next !== Number(clip.props.cardSfxVolume ?? 10)) onUpdate(updateCardSfx(clip, {cardSfxVolume: next}), "修改卡片弹出音量");
  };
  const preview = () => {
    if (!resolvedPreset || volume <= 0) return;
    activeCardSfxPreview?.pause();
    const audio = new window.Audio(`/${resolvedPreset.path}`);
    audio.volume = Math.max(0, Math.min(1, volume / 100 * resolvedPreset.gain));
    activeCardSfxPreview = audio;
    void audio.play().catch(() => undefined);
  };
  return <div className="inspector-section content-first card-sfx-controls">
    <h3>卡片弹出声音</h3>
    <p className="structured-editor-note">仅在卡片进入画面时播放一次；默认低音量自动轮换，不添加背景音乐。</p>
    <label className="wide-field"><span>声音类型</span><select aria-label="卡片弹出声音" disabled={disabled} value={selectedPreset} onChange={(event) => onUpdate(updateCardSfx(clip, {cardSfxPreset: event.currentTarget.value as typeof selectedPreset}), event.currentTarget.value === "none" ? "删除卡片弹出声音" : "更换卡片弹出声音")}>{CARD_SFX_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
    {selectedPreset === "auto" && resolvedPreset ? <small>当前自动使用：{resolvedPreset.label}</small> : null}
    {selectedPreset !== "none" ? <>
      <label className="wide-field"><span>音量：{Math.round(volume)}%</span><input aria-label="卡片弹出音量" disabled={disabled} type="range" min={0} max={100} step={1} value={volume} onChange={(event) => setVolume(Number(event.currentTarget.value))} onPointerUp={commitVolume} onBlur={commitVolume}/></label>
      <div className="object-actions"><button disabled={disabled || volume <= 0} onClick={preview}>试听当前声音</button><button disabled={disabled} onClick={() => onUpdate(updateCardSfx(clip, {cardSfxPreset: "none"}), "删除卡片弹出声音")}>移除声音</button></div>
    </> : <small>当前卡片不会播放弹出声音。</small>}
  </div>;
};

const templateEyebrowDefault = (componentId: string | undefined): string | undefined => {
  if (!componentId) return undefined;
  if (componentId.endsWith("process-flow")) return "PROCESS · 自动编号";
  if (componentId.endsWith("module-grid")) return "MODULE GRID · 自动编号";
  if (componentId.endsWith("data-formula")) return "DATA FORMULA · VERIFIED";
  if (componentId.endsWith("themed-card")) return "AI · TECH CARD";
  if (["growth-curve", "zero-timeline", "favorite-confirm", "folder-multiply", "data-table", "progressive-points", "saas-network", "ai-convergence", "caption-panel", "proof-frame", "demo-focus"].some((suffix) => componentId.endsWith(suffix))) return undefined;
  return "AI · VERIFIED";
};

export const MotionDesignerPanel = ({project, seed, allowedPresets, onPreview, onInsert, onClose, onSaved}: {project: ProjectDocument; seed: MotionDesignSeed; allowedPresets: string[]; onPreview: (draft: MotionDesignDraft) => void; onInsert: (draft: MotionDesignDraft) => void; onClose: () => void; onSaved: () => void}) => {
  const presetProps = {...seed.template.defaultProps, ...(seed.preset?.props ?? {})};
  const [name, setName] = useState(seed.preset?.name ?? `${templateName(seed.template.componentId)}预设`);
  const [title, setTitle] = useState(String(presetProps.title ?? presetProps.text ?? templateName(seed.template.componentId)));
  const [detail, setDetail] = useState(String(presetProps.detail ?? presetProps.purpose ?? "补充一句证明或解释"));
  const [accentColor, setAccentColor] = useState(String(presetProps.accentColor ?? "#38d9ff"));
  const [borderColor, setBorderColor] = useState(String(presetProps.borderColor ?? presetProps.accentColor ?? "#38d9ff"));
  const [surfaceStyle, setSurfaceStyle] = useState(String(presetProps.surfaceStyle ?? "glass"));
  const [gradientDirection, setGradientDirection] = useState(String(presetProps.gradientDirection ?? "left-solid"));
  const [gradientStrength, setGradientStrength] = useState(Number(presetProps.gradientStrength ?? 78));
  const [surfaceOpacity, setSurfaceOpacity] = useState(Number(presetProps.surfaceOpacity ?? 76));
  const [glassBlur, setGlassBlur] = useState(Number(presetProps.glassBlur ?? 18));
  const [materialSurfaceMode, setMaterialSurfaceMode] = useState(String(presetProps.materialSurfaceMode ?? "edge-glass"));
  const [edgeFadeMode, setEdgeFadeMode] = useState(String(presetProps.edgeFadeMode ?? "both"));
  const [edgeFadeWidth, setEdgeFadeWidth] = useState(Number(presetProps.edgeFadeWidth ?? 14));
  const [glassBorderWidth, setGlassBorderWidth] = useState(Number(presetProps.glassBorderWidth ?? 12));
  const [glassBorderGlow, setGlassBorderGlow] = useState(Number(presetProps.glassBorderGlow ?? 70));
  const [enterPreset, setEnterPreset] = useState(String(presetProps.enterPreset ?? allowedPresets[0] ?? "tech-slide-scale"));
  const defaultDurationSeconds = seed.template.componentId.endsWith("progressive-points") || seed.template.componentId.endsWith("typography.focus-stack")
    ? 15
    : seed.template.componentId.endsWith("typography.case-gallery") || seed.template.componentId.endsWith("typography.profile-proof")
      ? 8
    : seed.template.componentId.endsWith("ai-convergence")
      ? 6
      : 3;
  const [durationInFrames, setDurationInFrames] = useState(Math.min(project.settings.fps * defaultDurationSeconds, project.settings.durationInFrames));
  const [assetId, setAssetId] = useState<string | undefined>(typeof presetProps.assetId === "string" ? presetProps.assetId : undefined);
  const [message, setMessage] = useState("候选只在 Player 预览，不会自动写入时间线。");
  const [stepsText, setStepsText] = useState(stringArray(presetProps.steps).join("\n"));
  const [modulesText, setModulesText] = useState(serializeModules(presetProps.modules));
  const [termsText, setTermsText] = useState(serializeTerms(presetProps.terms));
  const [resultText, setResultText] = useState(String(presetProps.result ?? "2,000 元"));
  const [disclaimer, setDisclaimer] = useState(String(presetProps.disclaimer ?? "请替换为本条视频的真实数据口径"));
  const [valueText, setValueText] = useState(String(presetProps.valueText ?? "结果"));
  const [startLabel, setStartLabel] = useState(String(presetProps.startLabel ?? "起点"));
  const [endLabel, setEndLabel] = useState(String(presetProps.endLabel ?? "结果"));
  const [folderCount, setFolderCount] = useState(Number(presetProps.folderCount ?? 6));
  const [grayDelayFrames, setGrayDelayFrames] = useState(Number(presetProps.grayDelayFrames ?? project.settings.fps));
  const [theme, setTheme] = useState(String(presetProps.theme ?? "cyan"));
  const initialTableColumns = tableColumns(presetProps.columns);
  const [editableTableColumns, setEditableTableColumns] = useState(initialTableColumns);
  const [editableTableRows, setEditableTableRows] = useState(tableRows(presetProps.rows, initialTableColumns.length));
  const [rowStaggerFrames, setRowStaggerFrames] = useState(Number(presetProps.rowStaggerFrames ?? 6));
  const [editablePoints, setEditablePoints] = useState(progressivePoints(presetProps.points));
  const [pointFontSize, setPointFontSize] = useState(Number(presetProps.pointFontSize ?? 30));
  const [pointFontWeight, setPointFontWeight] = useState(Number(presetProps.pointFontWeight ?? 800));
  const [pointFontFamily, setPointFontFamily] = useState(String(presetProps.pointFontFamily ?? "system"));
  const [pointFontColor, setPointFontColor] = useState(String(presetProps.pointFontColor ?? "#ffffff"));
  const [tiltY, setTiltY] = useState(Number(presetProps.tiltY ?? 0));
  const [tiltX, setTiltX] = useState(Number(presetProps.tiltX ?? 0));
  const [peopleText, setPeopleText] = useState(stringArray(presetProps.peopleLabels).join("\n"));
  const [tileCount, setTileCount] = useState(Number(presetProps.tileCount ?? 30));
  const [assembleFrames, setAssembleFrames] = useState(Number(presetProps.assembleFrames ?? 46));
  const [rotationSpeed, setRotationSpeed] = useState(Number(presetProps.rotationSpeed ?? .28));
  const [sphereSize, setSphereSize] = useState(Number(presetProps.sphereSize ?? 78));
  const [tileSize, setTileSize] = useState(Number(presetProps.tileSize ?? 100));
  const [dissolveFrame, setDissolveFrame] = useState(Number(presetProps.dissolveFrame ?? 126));
  const [variant, setVariant] = useState(String(presetProps.variant ?? "glass"));
  const [textStartFrame, setTextStartFrame] = useState(Number(presetProps.textStartFrame ?? 8));
  const [textAnimation, setTextAnimation] = useState(String(presetProps.textAnimation ?? "fade-up"));
  const [staggerFrames, setStaggerFrames] = useState(Number(presetProps.staggerFrames ?? 4));
  const [eyebrowText, setEyebrowText] = useState(String(presetProps.eyebrowText ?? ""));
  const [showLogo, setShowLogo] = useState(presetProps.showLogo !== false);
  const [logoText, setLogoText] = useState(String(presetProps.logoText ?? "AI"));
  const [highlightText, setHighlightText] = useState(String(presetProps.highlightText ?? ""));
  const [dimOpacity, setDimOpacity] = useState(Number(presetProps.dimOpacity ?? 42));
  const [latinTitle, setLatinTitle] = useState(String(presetProps.latinTitle ?? "Project Owner"));
  const [factsText, setFactsText] = useState(stringArray(presetProps.facts).join("\n"));
  const [mediaSide, setMediaSide] = useState(String(presetProps.mediaSide ?? "right"));
  const [mediaRatio, setMediaRatio] = useState(Number(presetProps.mediaRatio ?? 46));
  const [editableCases, setEditableCases] = useState(typographyCases(presetProps.cases));
  const isProcess = seed.template.componentId.endsWith("process-flow");
  const isGrid = seed.template.componentId.endsWith("module-grid");
  const isFormula = seed.template.componentId.endsWith("data-formula");
  const isGrowth = seed.template.componentId.endsWith("growth-curve");
  const isZeroTimeline = seed.template.componentId.endsWith("zero-timeline");
  const isFavorite = seed.template.componentId.endsWith("favorite-confirm");
  const isFolders = seed.template.componentId.endsWith("folder-multiply");
  const isThemedCard = seed.template.componentId.endsWith("themed-card");
  const isTable = seed.template.componentId.endsWith("data-table");
  const isProgressivePoints = seed.template.componentId.endsWith("progressive-points");
  const isNetwork = seed.template.componentId.endsWith("saas-network");
  const isConvergence = seed.template.componentId.endsWith("ai-convergence");
  const isCaptionPanel = seed.template.componentId.endsWith("caption-panel");
  const isMediaTemplate = seed.template.componentId.endsWith("proof-frame") || seed.template.componentId.endsWith("demo-focus");
  const isTypographySection = seed.template.componentId.endsWith("typography.section-lockup");
  const isTypographyLogo = seed.template.componentId.endsWith("typography.logo-title");
  const isTypographyHero = seed.template.componentId.endsWith("typography.hero-focus");
  const isTypographyFocus = seed.template.componentId.endsWith("typography.focus-stack");
  const isTypographyProfile = seed.template.componentId.endsWith("typography.profile-proof");
  const isTypographyGallery = seed.template.componentId.endsWith("typography.case-gallery");
  const isCaseCollection = isTypographyGallery;
  const isTypography = isTypographySection || isTypographyLogo || isTypographyHero || isTypographyFocus || isTypographyProfile || isTypographyGallery;
  const supportsTextTiming = isGrowth || isZeroTimeline || isFavorite || isFolders || isThemedCard || isTable || isProgressivePoints || isNetwork || isConvergence || isCaptionPanel || isTypography;
  const preservedPresetProps = {...presetProps};
  ["title", "text", "detail", "purpose", "accentColor", "enterPreset", "assetId"].forEach((key) => delete preservedPresetProps[key]);
  const extraProps: Record<string, unknown> = {
    ...preservedPresetProps,
    borderColor,
    surfaceStyle,
    gradientDirection,
    gradientStrength: Math.round(gradientStrength),
    surfaceOpacity: Math.round(surfaceOpacity),
    glassBlur: Math.round(glassBlur),
    ...(isProcess ? {steps: parseSteps(stepsText)} : {}),
    ...(isGrid ? {modules: parseModules(modulesText)} : {}),
    ...(isFormula ? {terms: parseTerms(termsText), result: resultText, disclaimer} : {}),
    ...((isGrowth || isZeroTimeline) ? {valueText, startLabel, endLabel} : {}),
    ...(isFavorite ? {valueText} : {}),
    ...(isFolders ? {folderCount: Math.round(folderCount), grayDelayFrames: Math.round(grayDelayFrames)} : {}),
    ...(isThemedCard ? {theme} : {}),
    ...(isTable ? {columns: editableTableColumns, rows: editableTableRows, rowStaggerFrames: Math.round(rowStaggerFrames)} : {}),
    ...((isProgressivePoints || isTypographyFocus) ? {points: editablePoints.map((point) => ({
      text: point.text,
      appearFrame: Math.max(0, Math.round(point.appearFrame)),
      ...(point.fontColor ? {fontColor: point.fontColor} : {}),
      ...(point.accentColor ? {accentColor: point.accentColor} : {}),
      ...(point.logoText ? {logoText: point.logoText} : {}),
      ...(point.highlightText ? {highlightText: point.highlightText} : {}),
      ...(Number.isFinite(point.fontSize) ? {fontSize: Math.max(12, Math.round(point.fontSize!))} : {}),
      ...(point.surfaceStyle ? {surfaceStyle: point.surfaceStyle} : {}),
    })), pointFontSize: Math.round(pointFontSize), pointFontWeight: Math.round(pointFontWeight), pointFontFamily, pointFontColor, ...(isTypographyFocus ? {dimOpacity: Math.round(dimOpacity)} : {})} : {}),
    ...(isNetwork ? {peopleLabels: parseFlatItems(peopleText, 3)} : {}),
    ...(isConvergence ? {tileCount: Math.round(tileCount), assembleFrames: Math.round(assembleFrames), rotationSpeed, sphereSize: Math.round(sphereSize), tileSize: Math.round(tileSize), dissolveFrame: Math.round(dissolveFrame)} : {}),
    ...(isCaptionPanel ? {variant} : {}),
    ...(supportsTextTiming ? {textStartFrame: Math.round(textStartFrame), textAnimation, ...(isTypography ? {staggerFrames: Math.round(staggerFrames)} : {})} : {}),
    ...(isTypography ? {eyebrowText} : {}),
    ...(isTypographyLogo ? {showLogo, logoText} : {}),
    ...(isTypographyHero ? {highlightText} : {}),
    ...(isTypographyProfile ? {latinTitle, facts: parseSteps(factsText), mediaSide, mediaRatio: Math.round(mediaRatio)} : {}),
    ...(isCaseCollection ? {cases: editableCases.map((item) => ({
      title: item.title,
      detail: item.detail,
      appearFrame: Math.max(0, Math.round(item.appearFrame)),
      ...(item.assetId ? {assetId: item.assetId} : {}),
      ...(item.fontColor ? {fontColor: item.fontColor} : {}),
      ...(item.accentColor ? {accentColor: item.accentColor} : {}),
      ...(item.surfaceStyle ? {surfaceStyle: item.surfaceStyle} : {}),
    }))} : {}),
    ...(isMediaTemplate ? {materialSurfaceMode, edgeFadeMode, edgeFadeWidth: Math.round(edgeFadeWidth), glassBorderWidth: Math.round(glassBorderWidth), glassBorderGlow: Math.round(glassBorderGlow), tiltY, tiltX} : {}),
  };
  const transform = seed.preset?.defaultTransform ?? defaultTransform(seed.template.componentId, project);
  const draft: MotionDesignDraft = {name, componentId: seed.template.componentId, templateVersion: seed.template.version, title, detail, accentColor, enterPreset, durationInFrames, extraProps, ...(assetId ? {assetId} : {}), defaultTransform: transform};
  useEffect(() => {onPreview(draft);}, [name, title, detail, accentColor, borderColor, surfaceStyle, gradientDirection, gradientStrength, surfaceOpacity, glassBlur, materialSurfaceMode, edgeFadeMode, edgeFadeWidth, glassBorderWidth, glassBorderGlow, enterPreset, durationInFrames, assetId, stepsText, modulesText, termsText, resultText, disclaimer, valueText, startLabel, endLabel, folderCount, grayDelayFrames, theme, editableTableColumns, editableTableRows, rowStaggerFrames, editablePoints, pointFontSize, pointFontWeight, pointFontFamily, pointFontColor, tiltY, tiltX, peopleText, tileCount, assembleFrames, rotationSpeed, sphereSize, tileSize, dissolveFrame, variant, textStartFrame, textAnimation, staggerFrames, eyebrowText, showLogo, logoText, highlightText, dimOpacity, latinTitle, factsText, mediaSide, mediaRatio, editableCases, seed.template.componentId]);
  const presetDraft = {name: draft.name, componentId: draft.componentId, templateVersion: draft.templateVersion, props: {title: draft.title, detail: draft.detail, accentColor: draft.accentColor, enterPreset: draft.enterPreset, ...draft.extraProps, ...(draft.assetId ? {assetId: draft.assetId} : {})}, defaultTransform: draft.defaultTransform};
  return <aside className="inspector motion-designer-panel">
    <div className="panel-title"><SparkIcon/>动效设计 <span>候选预览</span></div>
    <div className="motion-design-head"><strong>{templateName(seed.template.componentId)}</strong><span>{seed.template.version} · 可信组件</span></div>
    <div className="inspector-section content-first"><h3>内容</h3><label className="wide-field"><span>预设名称</span><input value={name} onChange={(event) => setName(event.currentTarget.value)}/></label><label className="wide-field"><span>主文字</span><textarea value={title} onChange={(event) => setTitle(event.currentTarget.value)}/></label><label className="wide-field"><span>说明文字</span><textarea value={detail} onChange={(event) => setDetail(event.currentTarget.value)}/></label>
      {isTypography ? <label className="wide-field"><span>英文眉题 / 栏目标识（可清空）</span><input value={eyebrowText} onChange={(event) => setEyebrowText(event.currentTarget.value)}/></label> : null}
      {isTypographyLogo ? <div className="structured-editor"><div className="structured-editor-head"><strong>Logo 前缀</strong><span>Logo 作为第一层先进入，再带出文字层级</span></div><label className="wide-field"><span>显示 Logo</span><select value={showLogo ? "yes" : "no"} onChange={(event) => setShowLogo(event.currentTarget.value === "yes")}><option value="yes">显示</option><option value="no">隐藏</option></select></label>{showLogo ? <><label className="wide-field"><span>无图片时的 Logo 文字</span><input value={logoText} onChange={(event) => setLogoText(event.currentTarget.value)}/></label><label className="wide-field"><span>Logo 图片（可选）</span><select value={assetId ?? ""} onChange={(event) => setAssetId(event.currentTarget.value || undefined)}><option value="">使用文字 Logo</option>{project.assets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.id} value={asset.id}>{projectAssetName(asset)}</option>)}</select></label></> : null}</div> : null}
      {isTypographyHero ? <label className="wide-field"><span>主标题中需要高亮的词（可清空）</span><input value={highlightText} onChange={(event) => setHighlightText(event.currentTarget.value)}/></label> : null}
      {isTypographyProfile ? <div className="structured-editor"><div className="structured-editor-head"><strong>人物 / 项目履历与案例</strong><span>文字层级与案例画面分别进入，左右位置可一键镜像</span></div><label className="wide-field"><span>英文名 / 英文身份</span><input value={latinTitle} onChange={(event) => setLatinTitle(event.currentTarget.value)}/></label><label className="wide-field"><span>事实或履历（每行一条，最多 5 条）</span><textarea value={factsText} onChange={(event) => setFactsText(event.currentTarget.value)}/></label><label className="wide-field"><span>人物或案例素材</span><select value={assetId ?? ""} onChange={(event) => setAssetId(event.currentTarget.value || undefined)}><option value="">暂不选择</option>{project.assets.filter((asset) => asset.type === "image" || asset.type === "video").map((asset) => <option key={asset.id} value={asset.id}>{projectAssetName(asset)}</option>)}</select></label><div className="field-grid"><label><span>案例在画面哪一侧</span><select value={mediaSide} onChange={(event) => setMediaSide(event.currentTarget.value)}><option value="right">案例在右，文字在左</option><option value="left">案例在左，文字在右</option></select></label><label><span>案例宽度占比</span><input type="number" min={30} max={65} value={mediaRatio} onChange={(event) => setMediaRatio(Number(event.currentTarget.value))}/></label></div></div> : null}
      {isTypographyFocus ? <div className="structured-editor progressive-point-editor"><div className="structured-editor-head"><strong>观点接力逐句出现</strong><span>未来句不显示；新句出现后，旧句只降亮度，不缩小、不换位置</span></div><label className="wide-field"><span>句子数量</span><select value={editablePoints.length} onChange={(event) => setEditablePoints((current) => resizeProgressivePoints(current, Number(event.currentTarget.value), project.settings.fps * 2))}>{[1,2,3,4,5].map((count) => <option key={count} value={count}>{count} 句</option>)}</select></label><div className="progressive-point-list">{editablePoints.map((point, index) => <div className="progressive-point-row" key={index}><b>{String(index + 1).padStart(2, "0")}</b><label><span>完整句子</span><input value={point.text} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, text: event.currentTarget.value} : item))}/></label><label><span>高亮关键词（可清空）</span><input value={point.highlightText ?? ""} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, highlightText: event.currentTarget.value} : item))}/></label><label><span>本句字号</span><input type="number" min={12} step={1} value={point.fontSize ?? pointFontSize} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, fontSize: Math.max(12, Number(event.currentTarget.value))} : item))}/></label><label className="point-time-field"><span>出现秒数</span><input type="number" min={0} max={120} step={.1} value={Number((point.appearFrame / project.settings.fps).toFixed(1))} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, appearFrame: Math.max(0, Math.round(Number(event.currentTarget.value) * project.settings.fps))} : item))}/></label><div className="point-color-fields"><label><span>文字颜色</span><input type="color" value={point.fontColor ?? pointFontColor} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, fontColor: event.currentTarget.value} : item))}/></label><label><span>关键词颜色</span><input type="color" value={point.accentColor ?? accentColor} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, accentColor: event.currentTarget.value} : item))}/></label></div></div>)}</div><div className="field-grid"><label><span>新增句默认字号</span><input type="number" min={12} step={1} value={pointFontSize} onChange={(event) => setPointFontSize(Math.max(12, Number(event.currentTarget.value)))}/></label><label><span>已讲句亮度</span><input type="number" min={0} max={100} value={dimOpacity} onChange={(event) => setDimOpacity(Number(event.currentTarget.value))}/></label></div></div> : null}
      {isTypographyFocus ? <div className="field-grid"><label><span>观点字体</span><select value={pointFontFamily} onChange={(event) => setPointFontFamily(event.currentTarget.value)}>{progressiveFontOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>观点默认颜色</span><input type="color" value={pointFontColor} onChange={(event) => setPointFontColor(event.currentTarget.value)}/></label></div> : null}
      {isCaseCollection ? <div className="structured-editor"><div className="structured-editor-head"><strong>案例依次排开</strong><span>每个案例可设置出现时间、标题、说明与图片</span></div><label className="wide-field"><span>案例数量</span><select value={editableCases.length} onChange={(event) => setEditableCases((current) => resizeTypographyCases(current, Number(event.currentTarget.value), project.settings.fps))}>{[1,2,3,4].map((count) => <option key={count} value={count}>{count} 个</option>)}</select></label><div className="progressive-point-list">{editableCases.map((item, index) => <div className="progressive-point-row" key={index}><b>{String(index + 1).padStart(2, "0")}</b><label><span>案例标题</span><input value={item.title} onChange={(event) => setEditableCases((current) => current.map((entry, itemIndex) => itemIndex === index ? {...entry, title: event.currentTarget.value} : entry))}/></label><label><span>案例说明</span><input value={item.detail} onChange={(event) => setEditableCases((current) => current.map((entry, itemIndex) => itemIndex === index ? {...entry, detail: event.currentTarget.value} : entry))}/></label><label><span>出现秒数</span><input type="number" min={0} max={120} step={.1} value={Number((item.appearFrame / project.settings.fps).toFixed(1))} onChange={(event) => setEditableCases((current) => current.map((entry, itemIndex) => itemIndex === index ? {...entry, appearFrame: Math.max(0, Math.round(Number(event.currentTarget.value) * project.settings.fps))} : entry))}/></label><label><span>案例图片</span><select value={item.assetId ?? ""} onChange={(event) => setEditableCases((current) => current.map((entry, itemIndex) => itemIndex === index ? updateOptionalAsset(entry, event.currentTarget.value) : entry))}><option value="">暂不选择</option>{project.assets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.id} value={asset.id}>{projectAssetName(asset)}</option>)}</select></label></div>)}</div></div> : null}
      {isProcess ? <label className="wide-field"><span>流程步骤（每行一步，2–5步）</span><textarea value={stepsText} onChange={(event) => setStepsText(event.currentTarget.value)}/></label> : null}
      {isGrid ? <label className="wide-field"><span>模块（每行：标题 | 说明，2–6项）</span><textarea value={modulesText} onChange={(event) => setModulesText(event.currentTarget.value)}/></label> : null}
      {isFormula ? <><label className="wide-field"><span>计算项（每行：标签 | 数值 | 运算符）</span><textarea value={termsText} onChange={(event) => setTermsText(event.currentTarget.value)}/></label><label className="wide-field"><span>最终结果</span><input value={resultText} onChange={(event) => setResultText(event.currentTarget.value)}/></label><label className="wide-field"><span>数据口径</span><textarea value={disclaimer} onChange={(event) => setDisclaimer(event.currentTarget.value)}/></label></> : null}
      {(isGrowth || isZeroTimeline || isFavorite) ? <label className="wide-field"><span>结果文字</span><input value={valueText} onChange={(event) => setValueText(event.currentTarget.value)}/></label> : null}
      {(isGrowth || isZeroTimeline) ? <div className="field-grid"><label><span>开始标签</span><input value={startLabel} onChange={(event) => setStartLabel(event.currentTarget.value)}/></label><label><span>结束标签</span><input value={endLabel} onChange={(event) => setEndLabel(event.currentTarget.value)}/></label></div> : null}
      {isFolders ? <div className="field-grid"><label><span>文件夹数量</span><input type="number" min={2} max={8} value={folderCount} onChange={(event) => setFolderCount(Number(event.currentTarget.value))}/></label><label><span>变灰延迟（帧）</span><input type="number" min={0} max={300} value={grayDelayFrames} onChange={(event) => setGrayDelayFrames(Number(event.currentTarget.value))}/></label></div> : null}
      {isThemedCard ? <label className="wide-field"><span>卡片颜色主题</span><select value={theme} onChange={(event) => setTheme(event.currentTarget.value)}><option value="cyan">青蓝科技</option><option value="gold">金色证明</option><option value="purple">紫色 AI</option><option value="green">绿色结果</option><option value="red">红色警示</option></select></label> : null}
      {isTable ? <div className="structured-editor"><div className="structured-editor-head"><strong>表格逐格编辑</strong><span>点击后直接输入，新文字会自动替换原文字</span></div><div className="field-grid"><label><span>列数</span><select value={editableTableColumns.length} onChange={(event) => {const resized = resizeTable(editableTableColumns, editableTableRows, Number(event.currentTarget.value)); setEditableTableColumns(resized.columns); setEditableTableRows(resized.rows);}}>{[2,3,4].map((count) => <option key={count} value={count}>{count} 列</option>)}</select></label><label><span>行数</span><select value={editableTableRows.length} onChange={(event) => {const resized = resizeTable(editableTableColumns, editableTableRows, editableTableColumns.length, Number(event.currentTarget.value)); setEditableTableColumns(resized.columns); setEditableTableRows(resized.rows);}}>{[1,2,3,4,5,6].map((count) => <option key={count} value={count}>{count} 行</option>)}</select></label></div><div className="table-cell-editor" style={{gridTemplateColumns: `repeat(${editableTableColumns.length}, minmax(0, 1fr))`}}>{editableTableColumns.map((column, columnIndex) => <input key={`column-${columnIndex}`} aria-label={`表头 ${columnIndex + 1}`} className="table-heading-input" value={column} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditableTableColumns((current) => current.map((item, index) => index === columnIndex ? event.currentTarget.value : item))}/>) }{editableTableRows.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <input key={`cell-${rowIndex}-${columnIndex}`} aria-label={`第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`} value={cell} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditableTableRows((current) => current.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex ? currentRow.map((item, currentColumnIndex) => currentColumnIndex === columnIndex ? event.currentTarget.value : item) : currentRow))}/>))}</div><label className="wide-field"><span>每行出现间隔（帧）</span><input type="number" min={0} max={60} value={rowStaggerFrames} onChange={(event) => setRowStaggerFrames(Number(event.currentTarget.value))}/></label></div> : null}
      {isProgressivePoints ? <div className="structured-editor progressive-point-editor"><div className="structured-editor-head"><strong>观点逐条出现</strong><span>每一点可独立设置字体色和卡片标签色</span></div><label className="wide-field"><span>观点数量</span><select value={editablePoints.length} onChange={(event) => setEditablePoints((current) => resizeProgressivePoints(current, Number(event.currentTarget.value), project.settings.fps * 2))}>{[1,2,3,4,5].map((count) => <option key={count} value={count}>{count} 点</option>)}</select></label><div className="progressive-point-list">{editablePoints.map((point, index) => <div className="progressive-point-row" key={index}><b>{String(index + 1).padStart(2, "0")}</b><label><span>文字</span><input aria-label={`观点 ${index + 1} 文字`} value={point.text} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, text: event.currentTarget.value} : item))}/></label><label className="point-time-field"><span>出现秒数</span><input aria-label={`观点 ${index + 1} 出现秒数`} type="number" min={0} max={60} step={.1} value={Number((point.appearFrame / project.settings.fps).toFixed(1))} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, appearFrame: Math.max(0, Math.round(Number(event.currentTarget.value) * project.settings.fps))} : item))}/></label><div className="point-color-fields"><label><span>字体颜色</span><input aria-label={`观点 ${index + 1} 字体颜色`} type="color" value={point.fontColor ?? pointFontColor} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, fontColor: event.currentTarget.value} : item))}/></label><label><span>卡片标签色</span><input aria-label={`观点 ${index + 1} 卡片标签色`} type="color" value={point.accentColor ?? accentColor} onChange={(event) => setEditablePoints((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, accentColor: event.currentTarget.value} : item))}/></label></div></div>)}</div><div className="field-grid"><label><span>字号</span><input type="number" min={12} step={1} value={pointFontSize} onChange={(event) => setPointFontSize(Number(event.currentTarget.value))}/></label><label><span>字重</span><select value={pointFontWeight} onChange={(event) => setPointFontWeight(Number(event.currentTarget.value))}>{fontWeightOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div className="field-grid"><label><span>字体</span><select value={pointFontFamily} onChange={(event) => setPointFontFamily(event.currentTarget.value)}>{progressiveFontOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>默认文字颜色</span><input type="color" value={pointFontColor} onChange={(event) => setPointFontColor(event.currentTarget.value)}/></label></div></div> : null}
      {isNetwork ? <label className="wide-field"><span>三个人物名称（每行一个）</span><textarea value={peopleText} onChange={(event) => setPeopleText(event.currentTarget.value)}/></label> : null}
      {isConvergence ? <div className="structured-editor"><div className="structured-editor-head"><strong>AI Logo 球</strong><span>Logo 逐个补位、形成球体并缓慢旋转</span></div><div className="field-grid"><label><span>球体图标数量</span><input type="number" min={12} max={36} value={tileCount} onChange={(event) => setTileCount(Number(event.currentTarget.value))}/></label><label><span>汇聚时长（帧）</span><input type="number" min={12} max={120} value={assembleFrames} onChange={(event) => setAssembleFrames(Number(event.currentTarget.value))}/></label></div><div className="field-grid"><label><span>球体尺寸</span><input type="number" min={45} max={100} value={sphereSize} onChange={(event) => setSphereSize(Number(event.currentTarget.value))}/></label><label><span>Logo 卡片尺寸</span><input type="number" min={50} max={140} value={tileSize} onChange={(event) => setTileSize(Number(event.currentTarget.value))}/></label></div><div className="field-grid"><label><span>旋转速度</span><input type="number" min={-2} max={2} step={.05} value={rotationSpeed} onChange={(event) => setRotationSpeed(Number(event.currentTarget.value))}/></label><label><span>开始消散时间（帧）</span><input type="number" min={20} max={600} value={dissolveFrame} onChange={(event) => setDissolveFrame(Number(event.currentTarget.value))}/></label></div><p className="structured-editor-note">已读取 AI Logo 文件夹内的 16 个图标；画面只显示图标，不显示文件名或工具名称。</p></div> : null}
      {isCaptionPanel ? <label className="wide-field"><span>字幕背景样式</span><select value={variant} onChange={(event) => setVariant(event.currentTarget.value)}><option value="glass">玻璃面板</option><option value="neon">霓虹描边</option><option value="console">科技控制台</option><option value="gold">金色证明</option><option value="minimal">极简横线</option></select></label> : null}
    </div>
    <div className="inspector-section">
      <h3>视觉与运动</h3>
      <div className="field-grid"><label><span>强调色</span><input type="color" value={accentColor} onChange={(event) => setAccentColor(event.currentTarget.value)}/></label><label><span>边框颜色</span><input type="color" value={borderColor} onChange={(event) => setBorderColor(event.currentTarget.value)}/></label></div>
      <label className="wide-field"><span>卡片表面风格</span><select value={surfaceStyle} onChange={(event) => setSurfaceStyle(event.currentTarget.value)}>{surfaceStyleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="wide-field"><span>渐变方向</span><select value={gradientDirection} onChange={(event) => setGradientDirection(event.currentTarget.value)}>{gradientDirectionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <div className="field-grid"><label><span>渐变强度</span><input type="number" min={0} max={100} value={gradientStrength} onChange={(event) => setGradientStrength(Number(event.currentTarget.value))}/></label><label><span>表面透明度</span><input type="number" min={0} max={100} value={surfaceOpacity} onChange={(event) => setSurfaceOpacity(Number(event.currentTarget.value))}/></label></div>
      <label className="wide-field"><span>毛玻璃模糊度</span><input type="number" min={0} max={40} value={glassBlur} onChange={(event) => setGlassBlur(Number(event.currentTarget.value))}/></label>
      <label className="wide-field"><span>进入动效</span><select value={enterPreset} onChange={(event) => setEnterPreset(event.currentTarget.value)}>{allowedPresets.map((item) => <option key={item} value={item}>{motionName(item)}</option>)}</select></label>
      {supportsTextTiming ? <><div className="field-grid"><label><span>文字出现时间（帧）</span><input type="number" min={0} max={600} value={textStartFrame} onChange={(event) => setTextStartFrame(Number(event.currentTarget.value))}/></label><label><span>文字出现动画</span><select value={textAnimation} onChange={(event) => setTextAnimation(event.currentTarget.value)}>{textAnimations.map((item) => <option key={item} value={item}>{textAnimationName(item)}</option>)}</select></label></div>{isTypography ? <label className="wide-field"><span>文字层级间隔（帧）</span><input type="number" min={0} max={30} value={staggerFrames} onChange={(event) => setStaggerFrames(Number(event.currentTarget.value))}/></label> : null}</> : null}
      <label className="wide-field"><span>默认时长（秒）</span><input type="number" min={.5} max={20} step={.5} value={Number((durationInFrames / project.settings.fps).toFixed(1))} onChange={(event) => setDurationInFrames(Math.max(1, Math.round(Number(event.currentTarget.value) * project.settings.fps)))}/></label>
      {isMediaTemplate ? <><label className="wide-field"><span>证明/演示素材</span><select value={assetId ?? ""} onChange={(event) => setAssetId(event.currentTarget.value || undefined)}><option value="">暂不选择</option>{project.assets.filter((asset) => asset.type === "image" || asset.type === "video").map((asset) => <option key={asset.id} value={asset.id}>{projectAssetName(asset)}</option>)}</select></label><label className="wide-field"><span>素材融合方式</span><select value={materialSurfaceMode} onChange={(event) => setMaterialSurfaceMode(event.currentTarget.value)}><option value="edge-glass">科技毛玻璃边框（素材保持清晰）</option><option value="fade-only">仅素材边缘透明融合</option><option value="styled">整面卡片表面（会覆盖素材）</option></select></label>{materialSurfaceMode === "edge-glass" ? <div className="field-grid"><label><span>边框宽度</span><input type="number" min={2} max={32} step={1} value={glassBorderWidth} onChange={(event) => setGlassBorderWidth(Number(event.currentTarget.value))}/></label><label><span>边框光晕</span><input type="number" min={0} max={100} step={1} value={glassBorderGlow} onChange={(event) => setGlassBorderGlow(Number(event.currentTarget.value))}/></label></div> : null}<div className="field-grid"><label><span>边缘渐变</span><select value={edgeFadeMode} onChange={(event) => setEdgeFadeMode(event.currentTarget.value)}><option value="both">左右两侧淡出</option><option value="left">仅左侧淡出</option><option value="right">仅右侧淡出</option><option value="none">关闭淡出</option></select></label><label><span>渐变宽度</span><input type="number" min={0} max={45} step={1} value={edgeFadeWidth} onChange={(event) => setEdgeFadeWidth(Number(event.currentTarget.value))}/></label></div><div className="field-grid"><label><span>3D 侧倾</span><input type="number" min={-45} max={45} step={1} value={tiltY} onChange={(event) => setTiltY(Number(event.currentTarget.value))}/></label><label><span>3D 俯仰</span><input type="number" min={-30} max={30} step={1} value={tiltX} onChange={(event) => setTiltX(Number(event.currentTarget.value))}/></label></div></> : null}
    </div>
    <p className="motion-design-message">{message}</p><div className="motion-design-actions"><button onClick={onClose}>取消候选</button><button onClick={async () => {try {await api.saveMotionPreset(project.projectId, presetDraft); setMessage("已保存为无时间点的可复用预设。"); onSaved();} catch (cause) {setMessage(cause instanceof Error ? cause.message : "预设保存失败");}}}>保存预设</button><button className="primary" onClick={() => onInsert(draft)}>加入当前帧</button></div>
  </aside>;
};

export type RecordingInsert = {
  recording: RecordingSummary;
  sourceInFrames: number;
  durationInFrames: number;
  title: string;
  overlayText: string;
  enterPreset: string;
};

type MotionSlotKind =
  | "points"
  | "cases"
  | "items"
  | "groups"
  | "metrics"
  | "steps"
  | "modules"
  | "terms"
  | "facts"
  | "peopleLabels";

const stringMotionSlotKinds = new Set<MotionSlotKind>(["steps", "facts", "peopleLabels"]);

const motionSlotStyles = (clip: Clip, kind: MotionSlotKind): Record<string, unknown>[] => {
  const styles = clip.props.motionSlotStyles;
  if (!styles || typeof styles !== "object" || Array.isArray(styles)) return [];
  return structuredArray((styles as Record<string, unknown>)[kind]);
};

const finiteAtLeast = (value: unknown, minimum: number, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
};

const parseLines = (source: string, maximum = 10) =>
  source.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, maximum);

const MotionSlotControls = ({clip, disabled, project, onUpdate, onImportCaseAsset}: {
  clip: Clip;
  disabled: boolean;
  project: ProjectDocument;
  onUpdate: (clip: Clip, action: string) => void;
  onImportCaseAsset: (clipId: string, caseIndex: number, file: File) => Promise<void>;
}) => {
  if (clip.type !== "template") return null;
  const fps = project.settings.fps;
  const visualAssets = project.assets.filter((asset) => asset.type === "image" || asset.type === "video");
  const kind: MotionSlotKind | undefined = Array.isArray(clip.props.cases) ? "cases"
    : Array.isArray(clip.props.points) ? "points"
      : Array.isArray(clip.props.items) ? "items"
        : Array.isArray(clip.props.groups) ? "groups"
          : Array.isArray(clip.props.metrics) ? "metrics"
            : Array.isArray(clip.props.steps) ? "steps"
              : Array.isArray(clip.props.modules) ? "modules"
                : Array.isArray(clip.props.terms) ? "terms"
                  : Array.isArray(clip.props.facts) ? "facts"
                    : Array.isArray(clip.props.peopleLabels) ? "peopleLabels"
                      : undefined;
  const slotStyles = kind ? motionSlotStyles(clip, kind) : [];
  const source: Record<string, unknown>[] = kind
    ? stringMotionSlotKinds.has(kind)
      ? stringArray(clip.props[kind]).map((text, index) => ({text, ...(slotStyles[index] ?? {})}))
      : structuredArray(clip.props[kind])
    : [];
  const supportsSingleMedia = Boolean(clip.componentId && [
    "typography.logo-title",
    "typography.profile-proof",
  ].some((suffix) => clip.componentId!.endsWith(suffix)));
  if (!kind && !supportsSingleMedia) return null;

  const updateEntry = (index: number, patch: Record<string, unknown>, action: string) => {
    if (!kind) return;
    if (stringMotionSlotKinds.has(kind)) {
      const sourceText = stringArray(clip.props[kind]);
      const nextText = sourceText.map((entry, entryIndex) => entryIndex === index && typeof patch.text === "string" ? patch.text : entry);
      const stylePatch = {...patch};
      delete stylePatch.text;
      const nextStyles = sourceText.map((_, entryIndex) => entryIndex === index
        ? {...(slotStyles[entryIndex] ?? {}), ...stylePatch}
        : slotStyles[entryIndex] ?? {});
      const existingStyles = clip.props.motionSlotStyles && typeof clip.props.motionSlotStyles === "object" && !Array.isArray(clip.props.motionSlotStyles)
        ? clip.props.motionSlotStyles as Record<string, unknown>
        : {};
      onUpdate(updateClipProps(clip, {
        [kind]: nextText,
        motionSlotStyles: {...existingStyles, [kind]: nextStyles},
      }), action);
      return;
    }
    const next = source.map((entry, entryIndex) => entryIndex === index ? {...entry, ...patch} : entry);
    onUpdate(updateClipProps(clip, {[kind]: next}), action);
  };
  const slotValues = (entry: Record<string, unknown>) => {
    if (kind === "cases") return {
      text: String(entry.title ?? ""),
      detail: String(entry.detail ?? ""),
      fontColor: String(entry.titleColor ?? entry.fontColor ?? clip.props.bodyColor ?? "#ffffff"),
      fontSize: finiteAtLeast(entry.titleFontSize ?? entry.fontSize, 1, finiteAtLeast(clip.props.bodyFontSize, 1, 26)),
      highlightText: String(entry.titleHighlightText ?? entry.highlightText ?? ""),
      highlightColor: String(entry.highlightColor ?? entry.accentColor ?? clip.props.accentColor ?? "#38d9ff"),
    };
    if (kind === "groups") return {
      text: String(entry.title ?? ""),
      detail: stringArray(entry.items).join("\n"),
      fontColor: String(entry.fontColor ?? clip.props.bodyColor ?? "#ffffff"),
      fontSize: finiteAtLeast(entry.fontSize, 1, finiteAtLeast(clip.props.bodyFontSize, 1, 26)),
      highlightText: String(entry.highlightText ?? ""),
      highlightColor: String(entry.highlightColor ?? entry.accentColor ?? clip.props.accentColor ?? "#38d9ff"),
    };
    if (kind === "metrics") return {
      text: String(entry.label ?? ""),
      detail: String(entry.value ?? ""),
      fontColor: String(entry.fontColor ?? clip.props.bodyColor ?? "#ffffff"),
      fontSize: finiteAtLeast(entry.fontSize, 1, finiteAtLeast(clip.props.bodyFontSize, 1, 26)),
      highlightText: String(entry.highlightText ?? ""),
      highlightColor: String(entry.highlightColor ?? entry.accentColor ?? clip.props.accentColor ?? "#38d9ff"),
    };
    if (kind === "modules") return {
      text: String(entry.title ?? ""),
      detail: String(entry.detail ?? ""),
      fontColor: String(entry.fontColor ?? clip.props.bodyColor ?? "#ffffff"),
      fontSize: finiteAtLeast(entry.fontSize, 1, finiteAtLeast(clip.props.bodyFontSize, 1, 26)),
      highlightText: String(entry.highlightText ?? ""),
      highlightColor: String(entry.highlightColor ?? entry.accentColor ?? clip.props.accentColor ?? "#38d9ff"),
    };
    if (kind === "terms") return {
      text: String(entry.label ?? ""),
      detail: String(entry.value ?? ""),
      fontColor: String(entry.fontColor ?? clip.props.bodyColor ?? "#ffffff"),
      fontSize: finiteAtLeast(entry.fontSize, 1, finiteAtLeast(clip.props.bodyFontSize, 1, 26)),
      highlightText: String(entry.highlightText ?? ""),
      highlightColor: String(entry.highlightColor ?? entry.accentColor ?? clip.props.accentColor ?? "#38d9ff"),
    };
    return {
      text: String(entry.text ?? ""),
      detail: "",
      fontColor: String(entry.fontColor ?? clip.props.pointFontColor ?? clip.props.bodyColor ?? "#ffffff"),
      fontSize: finiteAtLeast(entry.fontSize, 1, finiteAtLeast(clip.props.pointFontSize ?? clip.props.bodyFontSize, 1, 30)),
      highlightText: String(entry.highlightText ?? ""),
      highlightColor: String(entry.highlightColor ?? entry.accentColor ?? clip.props.accentColor ?? "#38d9ff"),
    };
  };
  const textPatch = (value: string) => kind === "cases" ? {title: value}
    : kind === "groups" ? {title: value}
      : kind === "metrics" ? {label: value}
        : kind === "modules" ? {title: value}
          : kind === "terms" ? {label: value}
        : {text: value};
  const detailPatch = (value: string) => kind === "cases" ? {detail: value}
    : kind === "groups" ? {items: parseLines(value, 10)}
      : kind === "metrics" ? {value}
        : kind === "modules" ? {detail: value}
          : kind === "terms" ? {value}
        : {};
  const fontSizePatch = (value: number) => kind === "cases" ? {titleFontSize: value} : {fontSize: value};
  const fontColorPatch = (value: string) => kind === "cases" ? {titleColor: value, fontColor: value} : {fontColor: value};
  const highlightTextPatch = (value: string) => kind === "cases" ? {titleHighlightText: value} : {highlightText: value};
  const highlightColorPatch = (value: string) => ({highlightColor: value, accentColor: value});

  return <div className="inspector-section content-first motion-slot-controls">
    <h3>{kind ? `多素材文字（${source.length} 项）` : "素材 1"}</h3>
    {kind ? <p className="structured-editor-note">按当前动效实际素材数量逐项生成。每项独立保存，不会覆盖其他素材。</p> : null}
    {source.map((entry, index) => {
      const values = slotValues(entry);
      const appearFrame = finiteAtLeast(entry.appearFrame, 0, 10 + index * fps);
      return <div className="motion-slot-editor" data-testid={`motion-slot-${index + 1}`} key={`${clip.id}-${kind}-${index}`}>
        <strong>素材 {index + 1}</strong>
        <label className="wide-field"><span>文字</span><textarea disabled={disabled} key={`${clip.id}-${kind}-${index}-text-${values.text}`} defaultValue={values.text} onBlur={(event) => {if (event.currentTarget.value !== values.text) updateEntry(index, textPatch(event.currentTarget.value), `修改素材 ${index + 1} 文字`);}}/></label>
        {kind === "cases" || kind === "groups" || kind === "metrics" || kind === "modules" || kind === "terms" ? <label className="wide-field"><span>说明文字</span><textarea disabled={disabled} key={`${clip.id}-${kind}-${index}-detail-${values.detail}`} defaultValue={values.detail} onBlur={(event) => {if (event.currentTarget.value !== values.detail) updateEntry(index, detailPatch(event.currentTarget.value), `修改素材 ${index + 1} 说明`);}}/></label> : null}
        <div className="field-grid">
          <label><span>出现秒数</span><input disabled={disabled} type="number" min={0} step={.1} key={`${clip.id}-${kind}-${index}-time-${appearFrame}`} defaultValue={Number((appearFrame / fps).toFixed(2))} onBlur={(event) => {const seconds = Number(event.currentTarget.value); if (Number.isFinite(seconds)) updateEntry(index, {appearFrame: Math.max(0, Math.round(seconds * fps))}, `修改素材 ${index + 1} 出现时间`);}}/></label>
          <label><span>字体大小</span><input disabled={disabled} type="number" min={1} step={1} key={`${clip.id}-${kind}-${index}-size-${values.fontSize}`} defaultValue={values.fontSize} onBlur={(event) => {const value = Number(event.currentTarget.value); if (Number.isFinite(value)) updateEntry(index, fontSizePatch(Math.max(1, value)), `修改素材 ${index + 1} 字号`);}}/></label>
        </div>
        <div className="field-grid">
          <label><span>字体颜色</span><input disabled={disabled} type="color" value={values.fontColor} onChange={(event) => updateEntry(index, fontColorPatch(event.currentTarget.value), `修改素材 ${index + 1} 字体颜色`)}/></label>
          <label><span>强调颜色</span><input disabled={disabled} type="color" value={values.highlightColor} onChange={(event) => updateEntry(index, highlightColorPatch(event.currentTarget.value), `修改素材 ${index + 1} 强调颜色`)}/></label>
        </div>
        <label className="wide-field"><span>强调文字</span><input disabled={disabled} key={`${clip.id}-${kind}-${index}-highlight-${values.highlightText}`} defaultValue={values.highlightText} onBlur={(event) => {if (event.currentTarget.value !== values.highlightText) updateEntry(index, highlightTextPatch(event.currentTarget.value), `修改素材 ${index + 1} 强调文字`);}}/></label>
        {kind === "cases" ? <>
          <label className="wide-field"><span>图片或视频</span><select disabled={disabled} value={String(entry.assetId ?? "")} onChange={(event) => updateEntry(index, {assetId: event.currentTarget.value || undefined}, `修改素材 ${index + 1} 图片或视频`)}><option value="">暂不选择</option>{visualAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.type === "video" ? "视频｜" : "图片｜"}{projectAssetName(asset)}</option>)}</select></label>
          <label className={`case-direct-import ${disabled ? "disabled" : ""}`}><span>直接导入</span><strong>选择图片或视频</strong><input disabled={disabled} hidden type="file" accept="image/*,video/*" onChange={(event) => {const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onImportCaseAsset(clip.id, index, file);}}/></label>
        </> : null}
      </div>;
    })}
    {supportsSingleMedia ? <div className="motion-slot-editor" data-testid="motion-slot-single-media">
      <strong>素材 1</strong>
      <label className="wide-field"><span>图片或视频</span><select disabled={disabled} value={clip.assetId ?? ""} onChange={(event) => onUpdate(updateClipAsset(clip, event.currentTarget.value), "修改动效图片或视频")}><option value="">暂不选择</option>{visualAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.type === "video" ? "视频｜" : "图片｜"}{projectAssetName(asset)}</option>)}</select></label>
      <label className={`case-direct-import ${disabled ? "disabled" : ""}`}><span>直接导入</span><strong>选择图片或视频</strong><input disabled={disabled} hidden type="file" accept="image/*,video/*" onChange={(event) => {const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onImportCaseAsset(clip.id, -1, file);}}/></label>
    </div> : null}
  </div>;
};

export const ContentPanel = ({clip, track, project, allowedPresets, safe, onUpdate, onDuplicate, onDelete, onToggleFullScreen, onApplyGlobalVisual, onApplyGlobalPosition, onImportCaseAsset}: {
  clip: Clip | undefined;
  track: Track | undefined;
  project: ProjectDocument;
  allowedPresets: string[];
  safe: {left: number; right: number; top: number; bottom: number};
  onUpdate: (clip: Clip, action: string) => void;
  onDuplicate: (clipId: string) => void;
  onDelete: (clipId: string) => void;
  onToggleFullScreen: (clip: Clip) => void;
  onApplyGlobalVisual: (clip: Clip) => void;
  onApplyGlobalPosition: (clip: Clip, scope: "right-cards" | "left-materials") => void;
  onImportCaseAsset: (clipId: string, caseIndex: number, file: File) => Promise<void>;
}) => {
  if (!clip) return <aside className="inspector compact-inspector"><div className="panel-title"><SlidersIcon/>内容修改 <span>选择对象</span></div><div className="panel-empty"><SparkIcon/><span>选择画布或时间线对象</span></div></aside>;
  const disabled = Boolean(track?.locked);
  const isBaseVideo = clip.type === "video" && clip.transform.zIndex === 0;
  const isTypographyFocusStack = clip.componentId?.endsWith("typography.focus-stack") === true;
  const withinSafe = isBaseVideo || isClipWithinSafeArea(clip, safe, project.settings.width, project.settings.height);
  const primaryKey = clip.type === "template" ? "title" : typeof clip.props.text === "string" ? "text" : "title";
  const primaryValue = String(clip.props[primaryKey] ?? "");
  const isRecording = clip.type === "video" && clip.props.recording === true;
  // 面板模式必须由对象本身的轨道类型决定。带图片或视频引用的
  // Remotion 模板仍然是“动效”，不能因为 componentId / assetId
  // 被降级成只剩展示选项的“素材”面板。
  const isMaterial = clip.type === "image" || clip.type === "video";
  const materialSurfaceMode = String(clip.props.materialSurfaceMode ?? "edge-glass");
  const supportsMaterialBlend = isMaterial && !isBaseVideo;
  const showsCardSurfaceControls = (clip.type === "template" && !isMaterial) || (supportsMaterialBlend && materialSurfaceMode === "styled");
  const eyebrowDefault = templateEyebrowDefault(clip.componentId);
  const currentAsset = clip.assetId ? project.assets.find((asset) => asset.id === clip.assetId) : undefined;
  const tiltY = Number(clip.props.tiltY ?? 0);
  const tiltX = Number(clip.props.tiltX ?? 0);
  const isFocusedMaterial = clip.props.fullScreenFocus === true;
  const canAdjustLayer = clip.type !== "audio" && !isBaseVideo;
  const overlappingVisuals = project.clips.filter((item) => item.id !== clip.id
    && item.enabled
    && item.type !== "audio"
    && !(item.type === "video" && item.transform.zIndex === 0 && item.props.recording !== true)
    && item.from < clip.from + clip.durationInFrames
    && clip.from < item.from + item.durationInFrames);
  const highestOverlappingLayer = Math.max(1, ...overlappingVisuals.map((item) => item.transform.zIndex));
  const lowestOverlappingLayer = Math.min(clip.transform.zIndex, ...overlappingVisuals.map((item) => item.transform.zIndex));
  const updateLayer = (zIndex: number, action: string) => onUpdate({...clip, transform: {...clip.transform, zIndex: Math.max(1, Math.min(999, Math.round(zIndex)))}}, action);
  const centerX = clip.transform.x + clip.transform.width * clip.transform.scale / 2;
  const canAnchorRightCards = clip.type === "template" && !isMaterial && centerX >= project.settings.width / 2;
  const canAnchorLeftMaterials = supportsMaterialBlend && centerX <= project.settings.width / 2;
  const perspectivePreset = tiltY <= -5 ? "right" : tiltY >= 5 ? "left" : tiltX <= -4 ? "up" : tiltX >= 4 ? "down" : "flat";
  const updateMaterialPerspective = (preset: string) => {
    const values: Record<string, {tiltY: number; tiltX: number}> = {
      flat: {tiltY: 0, tiltX: 0},
      right: {tiltY: -22, tiltX: 2},
      left: {tiltY: 22, tiltX: 2},
      up: {tiltY: 0, tiltX: -15},
      down: {tiltY: 0, tiltX: 15},
    };
    onUpdate(updateClipProps(clip, values[preset] ?? {tiltY: 0, tiltX: 0}), "修改素材3D展示");
  };
  const panelHeader = <>
    <div className="panel-title"><SlidersIcon/>内容修改 <span>{typeLabel[clip.type]}</span></div>
    <div className="selection-head"><span className={`type-chip ${clip.type}`}>{typeLabel[clip.type]}</span><strong>{clip.id}</strong><small>{track?.name} · {disabled ? "轨道已锁定" : isBaseVideo ? "全画布原片" : withinSafe ? "安全区正常" : "超出安全区"}</small></div>
    <div className="object-actions"><button disabled={disabled} onClick={() => onDuplicate(clip.id)}>复制</button><button disabled={disabled} onClick={() => onUpdate({...clip, enabled: !clip.enabled}, clip.enabled ? "隐藏对象" : "显示对象")}>{clip.enabled ? "隐藏" : "显示"}</button><button className="danger" disabled={disabled} onClick={() => onDelete(clip.id)}>删除</button></div>
  </>;
  const layerControls = canAdjustLayer ? <div className="inspector-section layer-controls">
    <h3>画面层级</h3>
    <label className="wide-field"><span>层级数值</span><input aria-label="层级数值" disabled={disabled} type="number" min={1} step={1} value={clip.transform.zIndex} onChange={(event) => updateLayer(Number(event.currentTarget.value), "修改画面层级")}/></label>
    {overlappingVisuals.length ? <label className="wide-field"><span>显示在指定对象上方</span><select disabled={disabled} value="" onChange={(event) => {const target = overlappingVisuals.find((item) => item.id === event.currentTarget.value); if (target) updateLayer(target.transform.zIndex + 1, `将当前对象置于 ${target.id} 上方`);}}><option value="">选择同画面对象…</option>{overlappingVisuals.sort((a, b) => b.transform.zIndex - a.transform.zIndex).map((item) => <option key={item.id} value={item.id}>{item.id}（层级 {item.transform.zIndex}）</option>)}</select></label> : null}
    <div className="layer-action-grid"><button disabled={disabled} onClick={() => updateLayer(highestOverlappingLayer + 1, "将对象置于最上层")}>置于最上层</button><button disabled={disabled} onClick={() => updateLayer(clip.transform.zIndex + 1, "上移一层")}>上移一层</button><button disabled={disabled || clip.transform.zIndex <= 1} onClick={() => updateLayer(clip.transform.zIndex - 1, "下移一层")}>下移一层</button><button disabled={disabled || lowestOverlappingLayer <= 1} onClick={() => updateLayer(lowestOverlappingLayer - 1, "将对象置于最下层")}>置于最下层</button></div>
  </div> : null;
  const strictPanel = (() => {
  if (isMaterial) {
    const borderStyle = String(clip.props.materialBorderStyle ?? (materialSurfaceMode === "edge-glass" ? "glass" : "none"));
    const applyBorderStyle = (style: string) => {
      const props = style === "glass"
        ? {materialBorderStyle: style, materialSurfaceMode: "edge-glass", edgeFadeMode: "none", glassBorderWidth: 12, glassBorderGlow: 70}
        : style === "tech-transparent"
          ? {materialBorderStyle: style, materialSurfaceMode: "edge-glass", edgeFadeMode: "none", glassBorderWidth: 4, glassBorderGlow: 24}
          : {materialBorderStyle: style, materialSurfaceMode: "fade-only", edgeFadeMode: "none"};
      onUpdate(updateClipProps(clip, props), "修改素材边框风格");
    };
    return <aside className="inspector compact-inspector strict-content-panel material-content-panel">
      {panelHeader}
      <div className="inspector-section content-first">
        <h3>素材展示</h3>
        {!isBaseVideo ? <button className={`inspector-primary-action ${isFocusedMaterial ? "active" : ""}`} disabled={disabled} onClick={() => onToggleFullScreen(clip)}>{isFocusedMaterial ? "退出全屏并恢复原位置" : "一键铺满全屏＋右下角保留口播"}</button> : <p className="structured-editor-note">主口播原片保持全画布，不重复生成全屏实例。</p>}
        <label className="wide-field"><span>右下角口播形状</span><select disabled={disabled || isBaseVideo} value={String(clip.props.pipShape ?? "rounded-rect")} onChange={(event) => onUpdate(updateClipProps(clip, {pipShape: event.currentTarget.value}), "修改右下角口播形状")}><option value="rounded-rect">圆角长方形</option><option value="circle">圆形</option></select></label>
        <label className="wide-field"><span>边框风格</span><select disabled={disabled || isBaseVideo} value={borderStyle} onChange={(event) => applyBorderStyle(event.currentTarget.value)}><option value="none">无边框</option><option value="glass">科技毛玻璃边框</option><option value="tech-transparent">科技透明边框</option></select></label>
        <label className="wide-field"><span>边框颜色</span><input disabled={disabled || isBaseVideo} type="color" value={String(clip.props.borderColor ?? clip.props.accentColor ?? "#38d9ff")} onChange={(event) => onUpdate(updateClipProps(clip, {borderColor: event.currentTarget.value}), "修改素材边框颜色")}/></label>
      </div>
    </aside>;
  }
  if (clip.type === "audio") return <aside className="inspector compact-inspector strict-content-panel">{panelHeader}</aside>;
  if (clip.type === "template" || clip.type === "caption") {
    const titleValue = String(clip.props[primaryKey] ?? "");
    const detailValue = String(clip.props.detail ?? "");
    return <aside className="inspector compact-inspector strict-content-panel motion-content-panel">
      {panelHeader}
      <TypographyControls clip={clip} disabled={disabled} roles={clip.type === "caption" ? ["title"] : eyebrowDefault === undefined ? ["title", "detail", "body"] : ["eyebrow", "title", "detail", "body"]} onUpdate={onUpdate}/>
      {clip.type === "template" && eyebrowDefault !== undefined ? <div className="inspector-section content-first"><h3>顶部小字</h3><label className="wide-field"><span>顶部小字（可清空）</span><input disabled={disabled} key={`${clip.id}-eyebrow-${String(clip.props.eyebrowText ?? eyebrowDefault)}`} defaultValue={String(clip.props.eyebrowText ?? eyebrowDefault)} onBlur={(event) => onUpdate(updateClipProps(clip, {eyebrowText: event.currentTarget.value}), "修改顶部小字")}/></label></div> : null}
      <div className="inspector-section content-first">
        <h3>主文字</h3>
        <label className="wide-field"><span>主文字（可清空）</span><textarea disabled={disabled} key={`${clip.id}-main-${titleValue}`} defaultValue={titleValue} onBlur={(event) => {if (event.currentTarget.value !== titleValue) onUpdate(updateClipProps(clip, clip.type === "template" ? {title: event.currentTarget.value, text: event.currentTarget.value} : {[primaryKey]: event.currentTarget.value}), "修改主文字");}}/></label>
      </div>
      {clip.type === "template" ? <div className="inspector-section content-first"><h3>说明文字</h3><label className="wide-field"><span>说明文字（可清空）</span><textarea disabled={disabled} key={`${clip.id}-detail-${detailValue}`} defaultValue={detailValue} onBlur={(event) => {if (event.currentTarget.value !== detailValue) onUpdate(updateClipProps(clip, {detail: event.currentTarget.value}), "修改说明文字");}}/></label></div> : null}
      <MotionSlotControls clip={clip} disabled={disabled} project={project} onUpdate={onUpdate} onImportCaseAsset={onImportCaseAsset}/>
      {layerControls}
      {clip.type === "template" && supportsCardSfx(clip.componentId) ? <CardSfxControls clip={clip} disabled={disabled} onUpdate={onUpdate}/> : null}
      {clip.type === "template" ? <div className="inspector-section content-first"><h3>科技卡片倾斜</h3><label className="wide-field"><span>倾斜预设</span><select disabled={disabled} value={perspectivePreset} onChange={(event) => updateMaterialPerspective(event.currentTarget.value)}><option value="flat">不倾斜</option><option value="right">右侧后退</option><option value="left">左侧后退</option><option value="up">上侧后退</option><option value="down">下侧后退</option></select></label><div className="field-grid"><label><span>左右侧倾</span><input disabled={disabled} type="number" step={1} key={`${clip.id}-tilt-y-${tiltY}`} defaultValue={tiltY} onBlur={(event) => {const value = Number(event.currentTarget.value); if (Number.isFinite(value)) onUpdate(updateClipProps(clip, {tiltY: value}), "修改科技卡片左右倾斜");}}/></label><label><span>上下俯仰</span><input disabled={disabled} type="number" step={1} key={`${clip.id}-tilt-x-${tiltX}`} defaultValue={tiltX} onBlur={(event) => {const value = Number(event.currentTarget.value); if (Number.isFinite(value)) onUpdate(updateClipProps(clip, {tiltX: value}), "修改科技卡片上下倾斜");}}/></label></div></div> : null}
      <div className="inspector-section"><h3>风格与动效</h3><div className="field-grid"><label><span>强调色</span><input disabled={disabled} type="color" value={String(clip.props.accentColor ?? "#38d9ff")} onChange={(event) => onUpdate(updateClipProps(clip, {accentColor: event.currentTarget.value}), "修改强调色")}/></label><label><span>边框颜色</span><input disabled={disabled} type="color" value={String(clip.props.borderColor ?? clip.props.accentColor ?? "#38d9ff")} onChange={(event) => onUpdate(updateClipProps(clip, {borderColor: event.currentTarget.value}), "修改边框颜色")}/></label></div><label className="wide-field"><span>卡片风格</span><select disabled={disabled} value={String(clip.props.surfaceStyle ?? "glass")} onChange={(event) => onUpdate(updateClipProps(clip, {surfaceStyle: event.currentTarget.value}), "修改卡片风格")}>{surfaceStyleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="wide-field"><span>进入动效</span><select disabled={disabled} value={String(clip.props.enterPreset ?? allowedPresets[0])} onChange={(event) => onUpdate(updateClipProps(clip, {enterPreset: event.currentTarget.value}), "修改进入动效")}>{allowedPresets.map((preset) => <option key={preset} value={preset}>{motionName(preset)}</option>)}</select></label></div>
      <div className="inspector-section global-operations"><h3>批量应用</h3><p>只复制视觉或位置，不覆盖文字、素材和时间。</p><button disabled={disabled} onClick={() => onApplyGlobalVisual(clip)}>应用当前视觉到全部素材/动效</button><button disabled={disabled || !canAnchorRightCards} onClick={() => onApplyGlobalPosition(clip, "right-cards")}>统一全部右侧卡片位置</button><button disabled={disabled || !canAnchorLeftMaterials} onClick={() => onApplyGlobalPosition(clip, "left-materials")}>统一全部左侧素材位置</button></div>
    </aside>;
  }
  return undefined;
  })();
  return strictPanel ?? null;
};

export const RecordingPanel = ({project, currentFrame, allowedPresets, onInsert}: {project: ProjectDocument; currentFrame: number; allowedPresets: string[]; onInsert: (request: RecordingInsert) => void}) => {
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("录屏完成后点击“刷新录屏素材”即可采集。");
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(1);
  const [title, setTitle] = useState("案例演示");
  const [overlayText, setOverlayText] = useState("");
  const [preset, setPreset] = useState(allowedPresets.includes("focus-expand") ? "focus-expand" : allowedPresets[0] ?? "tech-slide-scale");
  const selected = recordings.find((item) => item.id === selectedId);
  const refresh = async () => {setLoading(true); try {const items = await api.recordings(project.projectId); setRecordings(items); if (!selectedId && items[0]) setSelectedId(items[0].id); setMessage(items.length ? `已找到 ${items.length} 条项目录屏。` : "还没有录屏，先打开系统录屏。 ");} catch (cause) {setMessage(cause instanceof Error ? cause.message : "录屏读取失败");} finally {setLoading(false);}};
  useEffect(() => {void refresh();}, [project.projectId]);
  useEffect(() => {if (!selected) return; setStartFrame(0); setEndFrame(selected.durationInFrames); setTitle(selected.fileName.replace(/[.][^.]+$/, ""));}, [selected?.id]);
  const duration = Math.max(1, endFrame - startFrame);
  return <aside className="inspector recording-panel">
    <div className="panel-title"><FilmIcon/>案例录屏 <span>当前帧 {currentFrame}</span></div>
    <div className="recording-actions"><button className="record-primary" onClick={async () => {try {await api.openSystemRecording(project.projectId); setMessage("系统录屏已打开。停止录制后回到这里刷新素材。");} catch (cause) {setMessage(cause instanceof Error ? cause.message : "无法打开系统录屏");}}}><span className="record-dot"/>打开系统录屏</button><button onClick={() => {void refresh();}} disabled={loading}>{loading ? "正在刷新…" : "刷新录屏素材"}</button></div>
    <p className="recording-message">{message}</p>
    <div className="recording-list">{recordings.map((item) => <button key={item.id} className={item.id === selectedId ? "active" : ""} onClick={() => setSelectedId(item.id)}><FilmIcon/><span><strong>{item.fileName}</strong><small>{item.durationSeconds.toFixed(1)} 秒 · {item.width}×{item.height}</small></span></button>)}</div>
    {selected ? <div className="recording-editor"><h3>裁切并加入当前镜头</h3><div className="trim-summary"><span>{(startFrame / project.settings.fps).toFixed(1)}s</span><strong>{(duration / project.settings.fps).toFixed(1)} 秒</strong><span>{(endFrame / project.settings.fps).toFixed(1)}s</span></div><div className="trim-inputs"><label><span>开始秒</span><input data-field="录屏开始秒" type="number" min={0} max={Math.max(0, selected.durationSeconds - 0.1)} step={0.1} value={Number((startFrame / project.settings.fps).toFixed(1))} onChange={(event) => setStartFrame(Math.min(Math.round(Number(event.currentTarget.value) * project.settings.fps), endFrame - 1))}/></label><label><span>结束秒</span><input data-field="录屏结束秒" type="number" min={0.1} max={selected.durationSeconds} step={0.1} value={Number((endFrame / project.settings.fps).toFixed(1))} onChange={(event) => setEndFrame(Math.max(Math.round(Number(event.currentTarget.value) * project.settings.fps), startFrame + 1))}/></label></div><label className="range-field"><span>开始位置</span><input type="range" min={0} max={Math.max(0, selected.durationInFrames - 1)} value={startFrame} onChange={(event) => setStartFrame(Math.min(Number(event.currentTarget.value), endFrame - 1))}/></label><label className="range-field"><span>结束位置</span><input type="range" min={1} max={selected.durationInFrames} value={endFrame} onChange={(event) => setEndFrame(Math.max(Number(event.currentTarget.value), startFrame + 1))}/></label><label className="wide-field"><span>案例名称</span><input value={title} onChange={(event) => setTitle(event.currentTarget.value)}/></label><label className="wide-field"><span>画面说明文字</span><textarea value={overlayText} onChange={(event) => setOverlayText(event.currentTarget.value)} placeholder="例如：这里注意模型返回的字段"/></label><label className="wide-field"><span>进入动效</span><select value={preset} onChange={(event) => setPreset(event.currentTarget.value)}>{allowedPresets.map((item) => <option key={item} value={item}>{motionName(item)}</option>)}</select></label><button className="insert-recording" onClick={() => onInsert({recording: selected, sourceInFrames: startFrame, durationInFrames: duration, title: title.trim() || "案例演示", overlayText: overlayText.trim(), enterPreset: preset})}>加入当前帧 {currentFrame}</button></div> : <div className="panel-empty small"><FilmIcon/><span>录屏素材会保存在当前项目内</span></div>}
  </aside>;
};

export const ShotNodes = ({project, currentFrame, onSelect}: {project: ProjectDocument; currentFrame: number; onSelect: (node: ShotNode) => void}) => {
  const nodes = [...(project.shotNodes ?? [])].sort((a, b) => a.from - b.from);
  return <section className="shot-nodes"><div className="shot-node-label">镜头定位</div><div className="shot-node-list">{nodes.map((node, index) => {const active = currentFrame >= node.from && currentFrame < node.from + node.durationInFrames; return <button key={node.id} className={active ? "active" : ""} onClick={() => onSelect(node)} title={node.visualIntent ?? node.label}><span>{String(index + 1).padStart(2, "0")}</span><strong>{node.label}</strong><small>{(node.from / project.settings.fps).toFixed(1)}s</small></button>;})}{nodes.length === 0 ? <div className="shot-node-empty">等待拍摄稿或导演计划生成镜头节点</div> : null}</div></section>;
};

export const MotionLibraryPanel = ({project, templates, onDesign, refreshKey}: {project: ProjectDocument; templates: TemplateDefinition[]; onDesign: (seed: MotionDesignSeed) => void; refreshKey: number}) => {
  const [presets, setPresets] = useState<MotionPreset[]>([]);
  useEffect(() => {void api.motionPresets().then(setPresets);}, [refreshKey]);
  const templateFor = (componentId: string) => templates.find((item) => item.componentId === componentId);
  const publicPresets = [
    ...presets.filter((preset) => preset.name.startsWith("备用｜")),
    ...createCommunityMotionPresets(project),
  ];
  return <div className="motion-library">
    <section className="generated-motion-library"><div className="library-section-head"><div><strong>动效</strong><span>通用备用动效与文字动效；可拖入画面或打开编辑</span></div><b>{publicPresets.length}</b></div><div className="motion-preset-list">{publicPresets.map((preset) => {const template = templateFor(preset.componentId); return <article key={preset.id} data-testid={`motion-preset-${preset.id}`} draggable={Boolean(template)} title={template ? "拖到中间画面即可加入当前时间" : "模板缺失"} onDragStart={(event) => {event.dataTransfer.setData("application/x-ajiunotes-motion-preset", preset.id); event.dataTransfer.setData("application/x-ajiunotes-motion-preset-json", JSON.stringify(preset)); event.dataTransfer.effectAllowed = "copy";}}><div><strong>{preset.name.replace(/^备用｜/, "")}</strong><span>{templateName(preset.componentId)} · {motionName(String(preset.props.enterPreset ?? ""))}</span><em>拖入画面</em></div><button disabled={!template} onClick={() => template && onDesign({template, preset})}>{template ? "打开" : "模板缺失"}</button></article>;})}{publicPresets.length === 0 ? <div className="shot-node-empty">当前没有可用动效</div> : null}</div></section>
  </div>;
};
