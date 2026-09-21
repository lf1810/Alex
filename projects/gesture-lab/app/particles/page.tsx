import type { Metadata } from "next";
import ParticleLab from "./ParticleLab";

export const metadata: Metadata = {
  title: "手势交互实验室｜3D 粒子场",
  description: "用张手、握拳和捏合控制球体、爱心、土星与文字粒子。",
};

export default function ParticlePage() {
  return <ParticleLab />;
}
