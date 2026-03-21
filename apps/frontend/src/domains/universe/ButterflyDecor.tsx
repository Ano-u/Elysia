import React from "react";
import { useUiStore } from "../../store/uiStore";

/** 蝴蝶 SVG 路径 — 两个对称贝塞尔翅膀 */
const BUTTERFLY_PATH =
  "M 0,-1 C -3,-4 -5,0 0,2 C 5,0 3,-4 0,-1 Z";

interface Butterfly {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  delay: string;
  duration: string;
}

const BUTTERFLIES: Butterfly[] = [
  { x: 15, y: 20, scale: 1.2, rotation: 15, opacity: 0.25, delay: "0s", duration: "24s" },
  { x: 72, y: 35, scale: 0.8, rotation: -20, opacity: 0.18, delay: "-6s", duration: "28s" },
  { x: 40, y: 70, scale: 1.0, rotation: 8, opacity: 0.22, delay: "-12s", duration: "22s" },
  { x: 85, y: 65, scale: 0.7, rotation: -12, opacity: 0.15, delay: "-18s", duration: "30s" },
  { x: 25, y: 50, scale: 0.9, rotation: 25, opacity: 0.2, delay: "-9s", duration: "26s" },
];

export const ButterflyDecor: React.FC = () => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
      {BUTTERFLIES.map((b, i) => (
        <svg
          key={i}
          viewBox="-6 -5 12 8"
          className={reduceMotion ? "" : "animate-butterfly-drift"}
          style={{
            position: "absolute",
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${24 * b.scale}px`,
            height: `${18 * b.scale}px`,
            opacity: b.opacity,
            transform: `rotate(${b.rotation}deg)`,
            animationDelay: b.delay,
            animationDuration: b.duration,
          }}
        >
          <defs>
            <linearGradient id={`bf-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--elysia-butterfly)" />
              <stop offset="100%" stopColor="var(--elysia-lavender)" />
            </linearGradient>
          </defs>
          <path d={BUTTERFLY_PATH} fill={`url(#bf-grad-${i})`} />
        </svg>
      ))}
    </div>
  );
};
