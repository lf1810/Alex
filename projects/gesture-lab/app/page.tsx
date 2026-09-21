import type { Metadata } from "next";
import GestureStage from "./GestureStage";

export const metadata: Metadata = {
  title: "手势交互实验室｜矢量折叠",
  description: "把多边形顶点绑定到双手指尖，实时生成可录制的动态视觉特效。",
};

export default function Home() {
  return <GestureStage />;
}
