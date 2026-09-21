import type {MotionPreset, ProjectDocument} from "@ajiunotes/contracts";

type Layout = "micro-anchor" | "logo-title" | "hero-focus" | "focus-stack" | "profile-proof" | "case-gallery";

type CommunityPresetInput = Omit<MotionPreset, "schemaVersion" | "status" | "templateVersion" | "sourceProjectId" | "createdAt" | "defaultTransform"> & {
  layout: Layout;
};

const definitions: CommunityPresetInput[] = [
  {
    id: "builtin-typography-section-lockup",
    name: "左上栏目文字锁定",
    componentId: "ajiunotes.typography.section-lockup",
    props: {
      eyebrowText: "AI PRACTICE",
      title: "AI 实操观察",
      detail: "当前章节的一句定位",
      accentColor: "#38d9ff",
      eyebrowFontSize: 17,
      titleFontSize: 34,
      detailFontSize: 17,
      textStartFrame: 3,
      textAnimation: "tracking-expand",
      staggerFrames: 4,
      enterPreset: "caption-fade",
      cardSfxPreset: "soft-click",
      cardSfxVolume: 5,
    },
    layout: "micro-anchor",
  },
  {
    id: "builtin-typography-logo-title",
    name: "Logo＋标题层级",
    componentId: "ajiunotes.typography.logo-title",
    props: {
      logoText: "AI",
      showLogo: true,
      eyebrowText: "FIELD NOTE",
      title: "工具或产品名称",
      detail: "一句话说明它解决什么问题",
      accentColor: "#38d9ff",
      eyebrowFontSize: 17,
      titleFontSize: 50,
      detailFontSize: 20,
      textStartFrame: 3,
      textAnimation: "mask-rise",
      staggerFrames: 4,
      enterPreset: "caption-fade",
      cardSfxPreset: "data-pop",
      cardSfxVolume: 6,
    },
    layout: "logo-title",
  },
  {
    id: "builtin-typography-hero-focus",
    name: "中央关键词聚焦",
    componentId: "ajiunotes.typography.hero-focus",
    props: {
      eyebrowText: "THE CORE IDEA",
      title: "判断力",
      detail: "真正值钱的不是工具，而是你对需求的判断",
      highlightText: "判断",
      accentColor: "#46e0a0",
      eyebrowFontSize: 17,
      titleFontSize: 82,
      detailFontSize: 20,
      textStartFrame: 3,
      textAnimation: "mask-rise",
      staggerFrames: 4,
      enterPreset: "caption-fade",
      cardSfxPreset: "tech-swish",
      cardSfxVolume: 6,
    },
    layout: "hero-focus",
  },
  {
    id: "builtin-typography-focus-stack",
    name: "观点接力变暗",
    componentId: "ajiunotes.typography.focus-stack",
    props: {
      eyebrowText: "KEY POINTS",
      title: "三个关键判断",
      detail: "",
      points: [
        {text: "问题是否真实存在", highlightText: "真实", appearFrame: 8, fontSize: 48, accentColor: "#38d9ff"},
        {text: "你能否判断商业价值", highlightText: "商业价值", appearFrame: 58, fontSize: 48, accentColor: "#46e0a0"},
        {text: "是否有人愿意付费", highlightText: "付费", appearFrame: 108, fontSize: 48, accentColor: "#e6b85c"},
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
      cardSfxPreset: "data-pop",
      cardSfxVolume: 5,
    },
    layout: "focus-stack",
  },
  {
    id: "builtin-typography-focus-stack-bright",
    name: "观点接力常亮",
    componentId: "ajiunotes.typography.focus-stack",
    props: {
      eyebrowText: "KEY POINTS",
      title: "三个关键判断",
      detail: "",
      points: [
        {text: "问题是否真实存在", highlightText: "真实", appearFrame: 8, fontSize: 48, accentColor: "#38d9ff"},
        {text: "你能否判断商业价值", highlightText: "商业价值", appearFrame: 58, fontSize: 48, accentColor: "#46e0a0"},
        {text: "是否有人愿意付费", highlightText: "付费", appearFrame: 108, fontSize: 48, accentColor: "#e6b85c"},
      ],
      historyMode: "bright",
      dimOpacity: 100,
      accentColor: "#38d9ff",
      textStartFrame: 3,
      textAnimation: "mask-rise",
      staggerFrames: 4,
      pointFontSize: 48,
      pointFontWeight: 800,
      pointFontFamily: "system",
      pointFontColor: "#ffffff",
      enterPreset: "caption-fade",
      cardSfxPreset: "data-pop",
      cardSfxVolume: 5,
    },
    layout: "focus-stack",
  },
  {
    id: "builtin-typography-profile-proof-right",
    name: "履历文字＋右侧案例",
    componentId: "ajiunotes.typography.profile-proof",
    props: {
      eyebrowText: "CASE PROFILE",
      latinTitle: "Project Owner",
      title: "案例主角",
      detail: "一句话说明他的身份与权威性",
      facts: ["第一条真实履历", "第二条关键信息", "第三条结果证明"],
      accentColor: "#46e0a0",
      mediaSide: "right",
      mediaRatio: 46,
      eyebrowFontSize: 16,
      titleFontSize: 66,
      detailFontSize: 19,
      textStartFrame: 3,
      textAnimation: "mask-rise",
      staggerFrames: 5,
      enterPreset: "caption-fade",
      cardSfxPreset: "glass-ping",
      cardSfxVolume: 5,
    },
    layout: "profile-proof",
  },
  {
    id: "builtin-typography-profile-proof-left",
    name: "左侧案例＋右侧履历",
    componentId: "ajiunotes.typography.profile-proof",
    props: {
      eyebrowText: "CASE PROFILE",
      latinTitle: "Project Owner",
      title: "案例主角",
      detail: "一句话说明他的身份与权威性",
      facts: ["第一条真实履历", "第二条关键信息", "第三条结果证明"],
      accentColor: "#38d9ff",
      mediaSide: "left",
      mediaRatio: 46,
      eyebrowFontSize: 16,
      titleFontSize: 66,
      detailFontSize: 19,
      textStartFrame: 3,
      textAnimation: "mask-rise",
      staggerFrames: 5,
      enterPreset: "caption-fade",
      cardSfxPreset: "glass-ping",
      cardSfxVolume: 5,
    },
    layout: "profile-proof",
  },
  {
    id: "builtin-typography-case-gallery",
    name: "多案例依次排开",
    componentId: "ajiunotes.typography.case-gallery",
    props: {
      eyebrowText: "CASES · VERIFIED",
      title: "三个真实案例",
      detail: "案例依次进入，前面的仍保留上下文",
      cases: [
        {title: "案例一", detail: "问题与结果", appearFrame: 10},
        {title: "案例二", detail: "问题与结果", appearFrame: 45},
        {title: "案例三", detail: "问题与结果", appearFrame: 80},
      ],
      accentColor: "#38d9ff",
      eyebrowFontSize: 16,
      titleFontSize: 42,
      detailFontSize: 17,
      textStartFrame: 3,
      textAnimation: "mask-rise",
      staggerFrames: 4,
      enterPreset: "caption-fade",
      cardSfxPreset: "soft-click",
      cardSfxVolume: 5,
    },
    layout: "case-gallery",
  },
];

const transformFor = (layout: Layout, project: ProjectDocument): MotionPreset["defaultTransform"] => {
  const {width, height, orientation} = project.settings;
  const horizontal = orientation === "horizontal";
  const transforms: Record<Layout, MotionPreset["defaultTransform"]> = {
    "micro-anchor": horizontal
      ? {x: width * .045, y: height * .055, width: width * .33, height: height * .18, scale: 1, rotation: 0, opacity: 1}
      : {x: width * .07, y: height * .09, width: width * .72, height: height * .12, scale: 1, rotation: 0, opacity: 1},
    "logo-title": horizontal
      ? {x: width * .07, y: height * .2, width: width * .47, height: height * .28, scale: 1, rotation: 0, opacity: 1}
      : {x: width * .08, y: height * .24, width: width * .84, height: height * .2, scale: 1, rotation: 0, opacity: 1},
    "hero-focus": horizontal
      ? {x: width * .2, y: height * .28, width: width * .6, height: height * .28, scale: 1, rotation: 0, opacity: 1}
      : {x: width * .08, y: height * .34, width: width * .84, height: height * .2, scale: 1, rotation: 0, opacity: 1},
    "focus-stack": horizontal
      ? {x: width * .08, y: height * .18, width: width * .84, height: height * .52, scale: 1, rotation: 0, opacity: 1}
      : {x: width * .06, y: height * .22, width: width * .88, height: height * .42, scale: 1, rotation: 0, opacity: 1},
    "profile-proof": horizontal
      ? {x: width * .04, y: height * .09, width: width * .92, height: height * .68, scale: 1, rotation: 0, opacity: 1}
      : {x: width * .05, y: height * .18, width: width * .9, height: height * .5, scale: 1, rotation: 0, opacity: 1},
    "case-gallery": horizontal
      ? {x: width * .06, y: height * .14, width: width * .88, height: height * .58, scale: 1, rotation: 0, opacity: 1}
      : {x: width * .05, y: height * .22, width: width * .9, height: height * .42, scale: 1, rotation: 0, opacity: 1},
  };
  return transforms[layout];
};

export const createCommunityMotionPresets = (project: ProjectDocument): MotionPreset[] =>
  definitions.map(({layout, ...definition}) => ({
    ...definition,
    schemaVersion: "motion-preset/1",
    status: "approved",
    templateVersion: "0.1.0",
    sourceProjectId: "community-builtins",
    createdAt: "2026-07-26T00:00:00.000Z",
    defaultTransform: transformFor(layout, project),
  }));
