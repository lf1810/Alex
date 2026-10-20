import {isCardSfxPresetId} from "@ajiunotes/contracts";
import type {TemplateDefinition} from "@ajiunotes/contracts";

export const TEMPLATE_REGISTRY_VERSION = "ajiunotes-tech-registry/0.6.0";

const template = (
  componentId: string,
  propsSchemaId: string,
  defaultProps: Record<string, unknown>,
): TemplateDefinition => ({
  componentId,
  version: "0.1.0",
  propsSchemaId,
  defaultProps,
  allowedOutputs: ["composition", "mp4"],
  deterministic: true,
});

export const templateRegistry: readonly TemplateDefinition[] = [
  template("ajiunotes.tech.result-card", "ajiunotes.props.result-card/1", {
    accentRole: "result",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.side-card", "ajiunotes.props.side-card/1", {
    accentRole: "status",
    enterPreset: "tech-slide-right",
  }),
  template("ajiunotes.tech.demo-focus", "ajiunotes.props.demo-focus/1", {
    speakerCorner: "bottom-left",
    materialSurfaceMode: "edge-glass",
    edgeFadeMode: "both",
    edgeFadeWidth: 14,
    glassBorderWidth: 12,
    glassBorderGlow: 70,
    enterPreset: "focus-expand",
  }),
  template("ajiunotes.tech.proof-frame", "ajiunotes.props.proof-frame/1", {
    accentRole: "evidence",
    materialSurfaceMode: "edge-glass",
    edgeFadeMode: "both",
    edgeFadeWidth: 14,
    glassBorderWidth: 12,
    glassBorderGlow: 70,
    enterPreset: "spring-scale-in",
  }),
  template("ajiunotes.tech.chapter-card", "ajiunotes.props.chapter-card/1", {
    accentRole: "status",
    enterPreset: "tech-slide-up",
  }),
  template("ajiunotes.tech.comparison-card", "ajiunotes.props.comparison-card/1", {
    accentRole: "comparison",
    enterPreset: "split-reveal",
  }),
  template("ajiunotes.tech.risk-card", "ajiunotes.props.risk-card/1", {
    accentRole: "risk",
    enterPreset: "warning-pulse-in",
  }),
  template("ajiunotes.tech.verdict-card", "ajiunotes.props.verdict-card/1", {
    accentRole: "result",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.caption", "ajiunotes.props.caption/1", {
    accentRole: "text",
    enterPreset: "caption-fade",
  }),
  template("ajiunotes.tech.process-flow", "ajiunotes.props.process-flow/1", {
    title: "从需求到交付",
    detail: "当前步骤会随时间依次点亮",
    steps: ["确认需求", "生成方案", "验证结果", "完成交付"],
    accentColor: "#38d9ff",
    enterPreset: "tech-slide-up",
  }),
  template("ajiunotes.tech.module-grid", "ajiunotes.props.module-grid/1", {
    title: "AI 工作流能力",
    detail: "一个模块只表达一个功能",
    modules: [
      {title: "选题", detail: "热点与普通人相关性"},
      {title: "脚本", detail: "删废话并重建钩子"},
      {title: "拍摄", detail: "镜头、动作与证据"},
      {title: "剪辑", detail: "动效和案例演示"},
    ],
    accentColor: "#38d9ff",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.data-formula", "ajiunotes.props.data-formula/1", {
    title: "价值计算",
    detail: "过程、单位和口径同时可见",
    terms: [
      {label: "节省时间", value: "20 小时", operator: "×"},
      {label: "每小时成本", value: "100 元", operator: "="},
    ],
    result: "2,000 元",
    disclaimer: "示例口径，请替换为本条视频的真实数据",
    accentColor: "#e6b85c",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.growth-curve", "ajiunotes.props.growth-curve/1", {
    title: "一周 AI 收益增长",
    detail: "从低点到结果的增长轨迹",
    valueText: "$50,000",
    startLabel: "起点",
    endLabel: "结果",
    accentColor: "#46e0a0",
    textStartFrame: 12,
    textAnimation: "scale-in",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.zero-timeline", "ajiunotes.props.zero-timeline/1", {
    title: "3月—6月",
    detail: "持续尝试，但没有获得正反馈",
    startLabel: "3月",
    endLabel: "6月",
    valueText: "0 变现",
    accentColor: "#ff646a",
    textStartFrame: 14,
    textAnimation: "fade-up",
    enterPreset: "tech-slide-right",
  }),
  template("ajiunotes.tech.favorite-confirm", "ajiunotes.props.favorite-confirm/1", {
    title: "先收藏，答案含金量很高",
    detail: "收藏确认",
    valueText: "已收藏",
    accentColor: "#e6b85c",
    textStartFrame: 18,
    textAnimation: "scale-in",
    enterPreset: "spring-scale-in",
  }),
  template("ajiunotes.tech.folder-multiply", "ajiunotes.props.folder-multiply/1", {
    title: "6 款产品",
    detail: "无一例外，全部变现失败",
    folderCount: 6,
    grayDelayFrames: 30,
    accentColor: "#38d9ff",
    textStartFrame: 12,
    textAnimation: "fade-up",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.themed-card", "ajiunotes.props.themed-card/1", {
    title: "这里填写主信息",
    detail: "这里填写补充说明或证据口径",
    theme: "cyan",
    accentColor: "#38d9ff",
    textStartFrame: 8,
    textAnimation: "slide-right",
    enterPreset: "tech-slide-right",
  }),
  template("ajiunotes.tech.data-table", "ajiunotes.props.data-table/1", {
    title: "科技信息列表",
    detail: "可编辑标题、表头与每一行内容",
    columns: ["模块", "作用", "状态"],
    rows: [
      ["需求判断", "确认真实痛点", "已完成"],
      ["AI 交付", "填平技术空缺", "进行中"],
      ["同行复用", "更换业务信息", "待交付"],
    ],
    rowStaggerFrames: 6,
    accentColor: "#38d9ff",
    textStartFrame: 8,
    textAnimation: "fade-up",
    enterPreset: "tech-slide-up",
  }),
  template("ajiunotes.tech.progressive-points", "ajiunotes.props.progressive-points/1", {
    title: "核心观点",
    detail: "观点会按设定时间逐条展开",
    points: [
      {text: "先判断真实需求", appearFrame: 12},
      {text: "再选择 AI 交付方式", appearFrame: 72},
      {text: "最后验证是否有人付费", appearFrame: 132},
    ],
    accentColor: "#38d9ff",
    textStartFrame: 6,
    textAnimation: "slide-right",
    pointFontSize: 30,
    pointFontWeight: 800,
    pointFontFamily: "system",
    enterPreset: "tech-slide-up",
  }),
  template("ajiunotes.tech.vertical-progressive-points", "ajiunotes.props.vertical-progressive-points/1", {
    title: "",
    detail: "",
    points: [
      {text: "客户分析", appearFrame: 12},
      {text: "补货订单", appearFrame: 72},
      {text: "挨店统计", appearFrame: 132},
    ],
    accentColor: "#38d9ff",
    surfaceStyle: "glass",
    gradientDirection: "left-solid",
    gradientStrength: 78,
    surfaceOpacity: 76,
    glassBlur: 18,
    textStartFrame: 6,
    textAnimation: "fade-up",
    pointFontSize: 38,
    pointFontWeight: 800,
    pointFontFamily: "system",
    pointFontColor: "#ffffff",
    enterPreset: "tech-slide-up",
  }),
  template("ajiunotes.tech.saas-network", "ajiunotes.props.saas-network/1", {
    title: "SaaS 平台",
    detail: "同一套能力，适配三位同行",
    peopleLabels: ["同行 A", "同行 B", "同行 C"],
    accentColor: "#38d9ff",
    textStartFrame: 10,
    textAnimation: "fade-up",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.ai-convergence", "ajiunotes.props.ai-convergence/4", {
    title: "",
    detail: "AI Logo 依次补位并组成旋转球形阵列",
    tools: ["DeepSeek", "Google", "海螺 AI", "Higress", "即梦", "Jina", "Lambda", "LlamaIndex", "Luma", "Mistral", "NotebookLM", "Notion", "NPLCloud", "Ollama", "Perplexity", "Qwen"],
    logoFiles: ["deepseek.svg", "google.svg", "hailuo.svg", "higress.svg", "jimeng.svg", "jina.svg", "lambda.svg", "llamaindex.svg", "luma.svg", "mistral.svg", "notebooklm.svg", "notion.svg", "nplcloud.svg", "ollama.svg", "perplexity.svg", "qwen.svg"],
    tileCount: 30,
    assembleFrames: 46,
    rotationSpeed: 0.28,
    sphereSize: 78,
    tileSize: 100,
    dissolveFrame: 126,
    accentColor: "#8a7dff",
    textStartFrame: 8,
    textAnimation: "scale-in",
    enterPreset: "tech-slide-scale",
  }),
  template("ajiunotes.tech.caption-panel", "ajiunotes.props.caption-panel/1", {
    title: "这里填写字幕重点",
    detail: "可选说明文字",
    variant: "glass",
    accentColor: "#38d9ff",
    textStartFrame: 4,
    textAnimation: "fade-up",
    enterPreset: "caption-fade",
  }),
  template("ajiunotes.typography.section-lockup", "ajiunotes.props.typography-section-lockup/1", {
    eyebrowText: "AI PRACTICE",
    title: "当前章节",
    detail: "一句中文定位",
    accentColor: "#38d9ff",
    textStartFrame: 3,
    textAnimation: "tracking-expand",
    staggerFrames: 4,
    enterPreset: "caption-fade",
  }),
  template("ajiunotes.typography.logo-title", "ajiunotes.props.typography-logo-title/1", {
    logoText: "AI",
    showLogo: true,
    eyebrowText: "AI · FIELD NOTE",
    title: "带 Logo 的观点标题",
    detail: "Logo、眉题、主标题依次进入",
    accentColor: "#38d9ff",
    textStartFrame: 3,
    textAnimation: "mask-rise",
    staggerFrames: 4,
    enterPreset: "caption-fade",
  }),
  template("ajiunotes.typography.hero-focus", "ajiunotes.props.typography-hero-focus/1", {
    eyebrowText: "EXPAND YOUR SCOPE",
    title: "拓宽思路",
    detail: "让一个关键词成为画面焦点",
    highlightText: "思路",
    accentColor: "#46e0a0",
    textStartFrame: 3,
    textAnimation: "mask-rise",
    staggerFrames: 4,
    enterPreset: "caption-fade",
  }),
  template("ajiunotes.typography.focus-stack", "ajiunotes.props.typography-focus-stack/1", {
    eyebrowText: "KEY POINTS",
    title: "观点接力",
    detail: "",
    points: [
      {text: "第一个判断", highlightText: "判断", appearFrame: 8, fontSize: 48, accentColor: "#38d9ff"},
      {text: "第二个判断", highlightText: "判断", appearFrame: 58, fontSize: 48, accentColor: "#46e0a0"},
      {text: "第三个判断", highlightText: "判断", appearFrame: 108, fontSize: 48, accentColor: "#e6b85c"},
    ],
    dimOpacity: 42,
    accentColor: "#38d9ff",
    textStartFrame: 3,
    textAnimation: "mask-rise",
    staggerFrames: 4,
    pointFontSize: 48,
    pointFontWeight: 800,
    pointFontFamily: "system",
    pointFontColor: "#ffffff",
    enterPreset: "caption-fade",
  }),
  template("ajiunotes.typography.profile-proof", "ajiunotes.props.typography-profile-proof/1", {
    eyebrowText: "CASE PROFILE",
    latinTitle: "Case Subject",
    title: "人物或项目名称",
    detail: "一句身份或案例定义",
    facts: ["第一条履历或事实", "第二条履历或事实", "第三条履历或事实"],
    accentColor: "#46e0a0",
    textStartFrame: 3,
    textAnimation: "mask-rise",
    staggerFrames: 5,
    mediaSide: "right",
    mediaRatio: 46,
    enterPreset: "caption-fade",
  }),
  template("ajiunotes.typography.case-gallery", "ajiunotes.props.typography-case-gallery/1", {
    eyebrowText: "CASES · VERIFIED",
    title: "案例依次展开",
    detail: "每个案例按时间进入并保留上下文",
    cases: [
      {title: "案例一", detail: "结果或标签", appearFrame: 10},
      {title: "案例二", detail: "结果或标签", appearFrame: 45},
      {title: "案例三", detail: "结果或标签", appearFrame: 80},
    ],
    accentColor: "#38d9ff",
    textStartFrame: 3,
    textAnimation: "mask-rise",
    staggerFrames: 4,
    enterPreset: "caption-fade",
  }),
];

export const trustedTemplateIds = new Set(templateRegistry.map((entry) => entry.componentId));

const effectAliases: Record<string, string> = {
  impact_text: "ajiunotes.tech.result-card",
  keyword_highlight: "ajiunotes.tech.result-card",
  keyword_punch: "ajiunotes.tech.result-card",
  popup_card: "ajiunotes.tech.side-card",
  hud_panel: "ajiunotes.tech.side-card",
  screenshot_overlay: "ajiunotes.tech.proof-frame",
  screen_demo: "ajiunotes.tech.demo-focus",
  demo_focus: "ajiunotes.tech.demo-focus",
  top_title_bar: "ajiunotes.tech.chapter-card",
  step_cards: "ajiunotes.tech.chapter-card",
  progress_bar: "ajiunotes.tech.chapter-card",
  comparison_card: "ajiunotes.tech.comparison-card",
  risk_card: "ajiunotes.tech.risk-card",
  error_card: "ajiunotes.tech.risk-card",
  cta_card: "ajiunotes.tech.verdict-card",
  verdict_card: "ajiunotes.tech.verdict-card",
  subtitle: "ajiunotes.tech.caption",
  process_flow: "ajiunotes.tech.process-flow",
  module_grid: "ajiunotes.tech.module-grid",
  data_formula: "ajiunotes.tech.data-formula",
  growth_curve: "ajiunotes.tech.growth-curve",
  zero_timeline: "ajiunotes.tech.zero-timeline",
  favorite_confirm: "ajiunotes.tech.favorite-confirm",
  folder_multiply: "ajiunotes.tech.folder-multiply",
  themed_card: "ajiunotes.tech.themed-card",
  data_table: "ajiunotes.tech.data-table",
  progressive_points: "ajiunotes.tech.progressive-points",
  vertical_progressive_points: "ajiunotes.tech.vertical-progressive-points",
  saas_network: "ajiunotes.tech.saas-network",
  ai_convergence: "ajiunotes.tech.ai-convergence",
  caption_panel: "ajiunotes.tech.caption-panel",
  typography_section_lockup: "ajiunotes.typography.section-lockup",
  typography_logo_title: "ajiunotes.typography.logo-title",
  typography_hero_focus: "ajiunotes.typography.hero-focus",
  typography_focus_stack: "ajiunotes.typography.focus-stack",
  typography_profile_proof: "ajiunotes.typography.profile-proof",
  typography_case_gallery: "ajiunotes.typography.case-gallery",
};

export const mapEffectTypeToComponentId = (effectType: string): string =>
  effectAliases[effectType.toLowerCase()] ?? "ajiunotes.tech.side-card";

export const getTemplateDefinition = (componentId: string): TemplateDefinition | undefined =>
  templateRegistry.find((entry) => entry.componentId === componentId);

export type TemplatePropsValidation = {ok: true; props: Record<string, unknown>} | {ok: false; issues: string[]};

const plainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum = 80) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
const editableText = (value: unknown, maximum = 80) => typeof value === "string" && value.length <= maximum;
const surfaceStyles = ["none", "glass", "tech-transparent", "deep-solid", "neon-outline", "gradient-panel"];
const validHexColor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const validOptionalCardStyle = (item: Record<string, unknown>) =>
  (typeof item.fontColor === "undefined" || validHexColor(item.fontColor))
  && (typeof item.accentColor === "undefined" || validHexColor(item.accentColor))
  && (typeof item.titleColor === "undefined" || validHexColor(item.titleColor))
  && (typeof item.detailColor === "undefined" || validHexColor(item.detailColor))
  && (typeof item.highlightColor === "undefined" || validHexColor(item.highlightColor))
  && (typeof item.titleFontSize === "undefined" || (Number.isInteger(item.titleFontSize) && Number(item.titleFontSize) >= 10 && Number(item.titleFontSize) <= 4096))
  && (typeof item.detailFontSize === "undefined" || (Number.isInteger(item.detailFontSize) && Number(item.detailFontSize) >= 10 && Number(item.detailFontSize) <= 4096))
  && (typeof item.titleHighlightText === "undefined" || editableText(item.titleHighlightText, 40))
  && (typeof item.detailHighlightText === "undefined" || editableText(item.detailHighlightText, 80))
  && (typeof item.surfaceStyle === "undefined" || surfaceStyles.includes(String(item.surfaceStyle)));

export const validateTemplateProps = (componentId: string, value: unknown): TemplatePropsValidation => {
  const definition = getTemplateDefinition(componentId);
  if (!definition) return {ok: false, issues: ["组件不在可信模板注册表中"]};
  if (!plainObject(value)) return {ok: false, issues: ["组件参数必须是对象"]};
  const props = {...definition.defaultProps, ...value};
  const issues: string[] = [];
  if (typeof props.title !== "undefined" && !editableText(props.title, 120)) issues.push("标题必须是 0–120 个字符");
  if (typeof props.detail !== "undefined" && !editableText(props.detail, 240)) issues.push("说明必须是 0–240 个字符");
  if (typeof props.accentColor !== "undefined" && (typeof props.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(props.accentColor))) issues.push("强调色必须是六位十六进制颜色");
  if (typeof props.highlightColor !== "undefined" && !validHexColor(props.highlightColor)) issues.push("高亮色必须是六位十六进制颜色");
  if (typeof props.titleHighlightText !== "undefined" && !editableText(props.titleHighlightText, 40)) issues.push("标题高亮词必须是 0–40 个字符");
  if (typeof props.detailHighlightText !== "undefined" && !editableText(props.detailHighlightText, 80)) issues.push("说明高亮词必须是 0–80 个字符");
  if (typeof props.borderColor !== "undefined" && (typeof props.borderColor !== "string" || !/^#[0-9a-f]{6}$/i.test(props.borderColor))) issues.push("边框颜色必须是六位十六进制颜色");
  if (typeof props.surfaceStyle !== "undefined" && !surfaceStyles.includes(String(props.surfaceStyle))) issues.push("卡片表面风格不受支持");
  if (typeof props.gradientDirection !== "undefined" && !["left-solid", "right-solid", "uniform"].includes(String(props.gradientDirection))) issues.push("渐变方向不受支持");
  if (typeof props.materialSurfaceMode !== "undefined" && !["fade-only", "edge-glass", "styled"].includes(String(props.materialSurfaceMode))) issues.push("素材融合方式不受支持");
  if (typeof props.edgeFadeMode !== "undefined" && !["none", "both", "left", "right"].includes(String(props.edgeFadeMode))) issues.push("素材边缘渐变方式不受支持");
  if (typeof props.edgeFadeWidth !== "undefined" && (!Number.isInteger(props.edgeFadeWidth) || Number(props.edgeFadeWidth) < 0 || Number(props.edgeFadeWidth) > 45)) issues.push("素材边缘渐变宽度必须是 0–45 的整数");
  if (typeof props.glassBorderWidth !== "undefined" && (!Number.isInteger(props.glassBorderWidth) || Number(props.glassBorderWidth) < 2 || Number(props.glassBorderWidth) > 32)) issues.push("毛玻璃边框宽度必须是 2–32 的整数");
  if (typeof props.glassBorderGlow !== "undefined" && (!Number.isInteger(props.glassBorderGlow) || Number(props.glassBorderGlow) < 0 || Number(props.glassBorderGlow) > 100)) issues.push("毛玻璃边框光晕必须是 0–100 的整数");
  if (typeof props.fullScreenFocus !== "undefined" && typeof props.fullScreenFocus !== "boolean") issues.push("全屏案例开关必须是布尔值");
  if (typeof props.pipShape !== "undefined" && !["rounded-rect", "circle"].includes(String(props.pipShape))) issues.push("右下角口播形状不受支持");
  if (typeof props.focusTransitionFrames !== "undefined" && (!Number.isInteger(props.focusTransitionFrames) || Number(props.focusTransitionFrames) < 6 || Number(props.focusTransitionFrames) > 45)) issues.push("全屏切换时间必须是 6–45 的整数帧");
  for (const [key, label, maximum] of [["gradientStrength", "渐变强度", 100], ["surfaceOpacity", "表面透明度", 100]] as const) {
    if (typeof props[key] !== "undefined" && (!Number.isInteger(props[key]) || Number(props[key]) < 0 || Number(props[key]) > maximum)) issues.push(`${label}必须是 0–${maximum} 的整数`);
  }
  if (typeof props.glassBlur !== "undefined" && (!Number.isFinite(Number(props.glassBlur)) || Number(props.glassBlur) < 0 || Number(props.glassBlur) > 100)) issues.push("毛玻璃模糊必须是 0–100 的数值");
  for (const role of ["eyebrow", "title", "detail", "body"] as const) {
    const size = props[`${role}FontSize`];
    const weight = props[`${role}FontWeight`];
    const fontColor = props[`${role}Color`];
    const family = props[`${role}FontFamily`];
    if (typeof size !== "undefined" && (!Number.isInteger(size) || Number(size) < 10 || Number(size) > 4096)) issues.push(`${role} 字号必须是 10–4096 的整数`);
    if (typeof weight !== "undefined" && ![400, 500, 600, 700, 800, 900].includes(Number(weight))) issues.push(`${role} 字重不受支持`);
    if (typeof fontColor !== "undefined" && (typeof fontColor !== "string" || !/^#[0-9a-f]{6}$/i.test(fontColor))) issues.push(`${role} 颜色必须是六位十六进制颜色`);
    if (typeof family !== "undefined" && !["system", "pingfang", "heiti", "songti", "kaiti", "rounded"].includes(String(family))) issues.push(`${role} 字体不受支持`);
  }
  if (typeof props.eyebrowText !== "undefined" && !editableText(props.eyebrowText, 80)) issues.push("顶部标识必须是 0–80 个字符");
  if (typeof props.labelText !== "undefined" && !editableText(props.labelText, 120)) issues.push("素材标签必须是 0–120 个字符");
  if (typeof props.textStartFrame !== "undefined" && (!Number.isInteger(props.textStartFrame) || Number(props.textStartFrame) < 0 || Number(props.textStartFrame) > 600)) issues.push("文字出现时间必须是 0–600 的整数帧");
  if (typeof props.textAnimation !== "undefined" && !["fade-up", "typewriter", "scale-in", "slide-right", "mask-rise", "tracking-expand", "word-pop"].includes(String(props.textAnimation))) issues.push("文字出现动画不受支持");
  if (typeof props.staggerFrames !== "undefined" && (!Number.isInteger(props.staggerFrames) || Number(props.staggerFrames) < 0 || Number(props.staggerFrames) > 30)) issues.push("文字层级间隔必须是 0–30 的整数帧");
  if (typeof props.cardSfxPreset !== "undefined" && !isCardSfxPresetId(props.cardSfxPreset)) issues.push("卡片弹出音效不受支持");
  if (typeof props.cardSfxVolume !== "undefined" && (!Number.isInteger(props.cardSfxVolume) || Number(props.cardSfxVolume) < 0 || Number(props.cardSfxVolume) > 100)) issues.push("卡片弹出音量必须是 0–100 的整数");

  if (componentId === "ajiunotes.tech.process-flow") {
    if (!Array.isArray(props.steps) || props.steps.length < 2 || props.steps.length > 5 || props.steps.some((item) => !text(item, 24))) issues.push("流程步骤必须包含 2–5 个、每个不超过 24 字的文本项");
  }
  if (componentId === "ajiunotes.tech.module-grid") {
    if (!Array.isArray(props.modules) || props.modules.length < 2 || props.modules.length > 6 || props.modules.some((item) => !plainObject(item) || !text(item.title, 24) || !text(item.detail, 50))) issues.push("模块必须包含 2–6 项，每项需要标题和说明");
  }
  if (componentId === "ajiunotes.tech.data-formula") {
    if (!Array.isArray(props.terms) || props.terms.length < 2 || props.terms.length > 5 || props.terms.some((item) => !plainObject(item) || !text(item.label, 24) || !text(item.value, 24) || (typeof item.operator !== "undefined" && !text(item.operator, 3)))) issues.push("公式必须包含 2–5 项，每项需要标签、数值和可选运算符");
    if (!editableText(props.result, 40)) issues.push("公式结果必须是 0–40 个字符");
    if (typeof props.disclaimer !== "undefined" && !editableText(props.disclaimer, 120)) issues.push("公式口径说明必须是 0–120 个字符");
  }
  if (["ajiunotes.tech.growth-curve", "ajiunotes.tech.zero-timeline", "ajiunotes.tech.favorite-confirm"].includes(componentId) && !editableText(props.valueText, 40)) issues.push("结果文字必须是 0–40 个字符");
  if (["ajiunotes.tech.growth-curve", "ajiunotes.tech.zero-timeline"].includes(componentId) && (!editableText(props.startLabel, 24) || !editableText(props.endLabel, 24))) issues.push("起止标签必须是 0–24 个字符");
  if (componentId === "ajiunotes.tech.folder-multiply" && (!Number.isInteger(props.folderCount) || Number(props.folderCount) < 2 || Number(props.folderCount) > 8)) issues.push("文件夹数量必须是 2–8 的整数");
  if (componentId === "ajiunotes.tech.folder-multiply" && (!Number.isInteger(props.grayDelayFrames) || Number(props.grayDelayFrames) < 0 || Number(props.grayDelayFrames) > 300)) issues.push("变灰延迟必须是 0–300 的整数帧");
  if (componentId === "ajiunotes.tech.themed-card" && !["cyan", "gold", "purple", "green", "red"].includes(String(props.theme))) issues.push("文字卡主题不受支持");
  if (componentId === "ajiunotes.tech.data-table") {
    if (!Array.isArray(props.columns) || props.columns.length < 2 || props.columns.length > 4 || props.columns.some((item) => !text(item, 20))) issues.push("表头必须包含 2–4 列");
    if (!Array.isArray(props.rows) || props.rows.length < 1 || props.rows.length > 6 || props.rows.some((row) => !Array.isArray(row) || row.length !== (Array.isArray(props.columns) ? props.columns.length : 0) || row.some((item) => !text(item, 30)))) issues.push("表格必须包含 1–6 行，且每行列数与表头一致");
    if (!Number.isInteger(props.rowStaggerFrames) || Number(props.rowStaggerFrames) < 0 || Number(props.rowStaggerFrames) > 60) issues.push("表格行间隔必须是 0–60 的整数帧");
  }
  if (componentId.endsWith("progressive-points")) {
    if (!Array.isArray(props.points) || props.points.length < 1 || props.points.length > 5 || props.points.some((item) => !plainObject(item) || !text(item.text, 60) || !Number.isInteger(item.appearFrame) || Number(item.appearFrame) < 0 || Number(item.appearFrame) > 1800)) issues.push("递进观点必须包含 1–5 项，每项需要文字和 0–1800 的出现帧");
    if (Array.isArray(props.points) && props.points.some((item) => plainObject(item) && typeof item.fontColor !== "undefined" && (typeof item.fontColor !== "string" || !/^#[0-9a-f]{6}$/i.test(item.fontColor)))) issues.push("每条观点字体颜色必须是六位十六进制颜色");
    if (Array.isArray(props.points) && props.points.some((item) => plainObject(item) && typeof item.accentColor !== "undefined" && (typeof item.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(item.accentColor)))) issues.push("每条观点卡片标签颜色必须是六位十六进制颜色");
    if (Array.isArray(props.points) && props.points.some((item) => plainObject(item) && !validOptionalCardStyle(item))) issues.push("每条观点的颜色或表面风格不受支持");
    if (typeof props.pointFontSize !== "undefined" && (!Number.isInteger(props.pointFontSize) || Number(props.pointFontSize) < 12 || Number(props.pointFontSize) > 4096)) issues.push("观点字号必须是 12–4096 的整数");
    if (typeof props.pointFontWeight !== "undefined" && (!Number.isInteger(props.pointFontWeight) || Number(props.pointFontWeight) < 400 || Number(props.pointFontWeight) > 900)) issues.push("观点字重必须是 400–900 的整数");
    if (typeof props.pointFontFamily !== "undefined" && !["system", "pingfang", "heiti", "songti", "kaiti", "rounded"].includes(String(props.pointFontFamily))) issues.push("观点字体不受支持");
    if (typeof props.pointFontColor !== "undefined" && (typeof props.pointFontColor !== "string" || !/^#[0-9a-f]{6}$/i.test(props.pointFontColor))) issues.push("观点颜色必须是六位十六进制颜色");
  }
  if (typeof props.tiltY !== "undefined" && (!Number.isFinite(Number(props.tiltY)) || Number(props.tiltY) < -45 || Number(props.tiltY) > 45)) issues.push("3D 侧倾角度必须在 -45° 到 45° 之间");
  if (typeof props.tiltX !== "undefined" && (!Number.isFinite(Number(props.tiltX)) || Number(props.tiltX) < -30 || Number(props.tiltX) > 30)) issues.push("3D 俯仰角度必须在 -30° 到 30° 之间");
  if (componentId === "ajiunotes.tech.saas-network" && (!Array.isArray(props.peopleLabels) || props.peopleLabels.length !== 3 || props.peopleLabels.some((item) => !text(item, 20)))) issues.push("SaaS 连接图需要恰好 3 个人物标签");
  if (componentId === "ajiunotes.tech.ai-convergence") {
    if (!Array.isArray(props.tools) || props.tools.length < 3 || props.tools.length > 16 || props.tools.some((item) => !text(item, 20))) issues.push("AI 工具必须包含 3–16 个名称");
    if (!Array.isArray(props.logoFiles) || props.logoFiles.length > 16 || props.logoFiles.some((item) => typeof item !== "string" || !/^[a-z0-9._-]+\.(png|jpe?g|webp|svg)$/i.test(item))) issues.push("AI Logo 文件必须是 0–16 个安全图片文件名");
    if (!Number.isInteger(props.tileCount) || Number(props.tileCount) < 12 || Number(props.tileCount) > 36) issues.push("Logo 球图标数量必须是 12–36 的整数");
    if (!Number.isInteger(props.assembleFrames) || Number(props.assembleFrames) < 12 || Number(props.assembleFrames) > 120) issues.push("Logo 球汇聚时间必须是 12–120 的整数帧");
    if (!Number.isFinite(Number(props.rotationSpeed)) || Number(props.rotationSpeed) < -2 || Number(props.rotationSpeed) > 2) issues.push("Logo 球旋转速度必须在 -2 到 2 之间");
    if (!Number.isInteger(props.sphereSize) || Number(props.sphereSize) < 45 || Number(props.sphereSize) > 100) issues.push("Logo 球尺寸必须是 45–100 的整数");
    if (!Number.isInteger(props.tileSize) || Number(props.tileSize) < 50 || Number(props.tileSize) > 140) issues.push("Logo 卡片尺寸必须是 50–140 的整数");
    if (!Number.isInteger(props.dissolveFrame) || Number(props.dissolveFrame) < 20 || Number(props.dissolveFrame) > 600) issues.push("消散时间必须是 20–600 的整数帧");
  }
  if (componentId === "ajiunotes.tech.caption-panel" && !["glass", "neon", "console", "gold", "minimal"].includes(String(props.variant))) issues.push("字幕背景样式不受支持");
  if (componentId === "ajiunotes.typography.logo-title") {
    if (typeof props.showLogo !== "boolean") issues.push("Logo 显示开关必须是布尔值");
    if (!editableText(props.logoText, 12)) issues.push("Logo 文字必须是 0–12 个字符");
  }
  if (componentId === "ajiunotes.typography.hero-focus" && !editableText(props.highlightText, 40)) issues.push("强调词必须是 0–40 个字符");
  if (componentId === "ajiunotes.typography.focus-stack") {
    if (!Array.isArray(props.points) || props.points.length < 1 || props.points.length > 5 || props.points.some((item) => !plainObject(item) || !text(item.text, 60) || !Number.isInteger(item.appearFrame) || Number(item.appearFrame) < 0 || Number(item.appearFrame) > 1800 || (typeof item.logoText !== "undefined" && !editableText(item.logoText, 12)) || (typeof item.highlightText !== "undefined" && !editableText(item.highlightText, 40)) || (typeof item.fontSize !== "undefined" && (!Number.isInteger(item.fontSize) || Number(item.fontSize) < 12 || Number(item.fontSize) > 4096)))) issues.push("观点接力必须包含 1–5 句，每句需要文字、0–1800 的出现帧，并可设置高亮关键词和 12–4096 的独立字号");
    if (!Number.isInteger(props.dimOpacity) || Number(props.dimOpacity) < 0 || Number(props.dimOpacity) > 100) issues.push("观点降亮度必须是 0–100 的整数");
    if (!["dim", "bright"].includes(String(props.historyMode ?? "dim"))) issues.push("观点接力保留模式只支持降亮或常亮");
    if (Array.isArray(props.points) && props.points.some((item) => plainObject(item) && !validOptionalCardStyle(item))) issues.push("观点接力的颜色或表面风格不受支持");
    if (typeof props.pointFontSize !== "undefined" && (!Number.isInteger(props.pointFontSize) || Number(props.pointFontSize) < 12 || Number(props.pointFontSize) > 4096)) issues.push("观点接力字号必须是 12–4096 的整数");
    if (typeof props.pointFontWeight !== "undefined" && ![400, 500, 600, 700, 800, 900].includes(Number(props.pointFontWeight))) issues.push("观点接力字重必须是 400–900 的受支持档位");
  }
  if (componentId === "ajiunotes.typography.profile-proof") {
    if (!editableText(props.latinTitle, 80)) issues.push("英文名称必须是 0–80 个字符");
    if (!Array.isArray(props.facts) || props.facts.length < 1 || props.facts.length > 5 || props.facts.some((item) => !text(item, 60))) issues.push("人物履历必须包含 1–5 条、每条不超过 60 字");
    if (!["left", "right"].includes(String(props.mediaSide))) issues.push("案例素材位置不受支持");
    if (!Number.isInteger(props.mediaRatio) || Number(props.mediaRatio) < 30 || Number(props.mediaRatio) > 65) issues.push("案例素材宽度必须是 30–65 的整数");
  }
  if (componentId === "ajiunotes.typography.case-gallery") {
    if (!Array.isArray(props.cases) || props.cases.length < 1 || props.cases.length > 4 || props.cases.some((item) => !plainObject(item) || !text(item.title, 40) || !editableText(item.detail, 80) || !Number.isInteger(item.appearFrame) || Number(item.appearFrame) < 0 || Number(item.appearFrame) > 1800 || (typeof item.assetId !== "undefined" && !editableText(item.assetId, 160)))) issues.push("案例列表必须包含 1–4 项，每项需要标题、说明和出现帧");
    if (Array.isArray(props.cases) && props.cases.some((item) => plainObject(item) && !validOptionalCardStyle(item))) issues.push("案例卡颜色或表面风格不受支持");
  }

  return issues.length ? {ok: false, issues} : {ok: true, props};
};
