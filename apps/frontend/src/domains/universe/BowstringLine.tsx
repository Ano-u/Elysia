import React from "react";
import { useUiStore } from "../../store/uiStore";

interface BowstringLineProps {
  /** 起点坐标 */
  x1: number;
  y1: number;
  /** 终点坐标 */
  x2: number;
  y2: number;
  /** 唯一标识，用于渐变 id */
  id: string;
}

export const BowstringLine: React.FC<BowstringLineProps> = ({
  x1, y1, x2, y2, id,
}) => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  // 控制点：取中点后垂直方向偏移，制造弓弦弧度
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  // 垂直方向偏移量，与距离成比例但有上限
  const offset = Math.min(len * 0.25, 60);
  // 垂直方向单位向量（逆时针旋转90度）
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ? dx / len : 0;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;

  const gradientId = `bowstring-${id}`;
  const d = `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--elysia-bowstring)" stopOpacity="0.4" />
          <stop offset="50%" stopColor="var(--elysia-lavender)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--elysia-butterfly)" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* 底层光晕 */}
      <path
        d={d}
        stroke="var(--elysia-lavender)"
        strokeWidth="4"
        fill="none"
        opacity="0.08"
        strokeLinecap="round"
      />
      {/* 主弓弦线 */}
      <path
        d={d}
        stroke={`url(#${gradientId})`}
        strokeWidth="1.5"
        fill="none"
        opacity="0.35"
        strokeLinecap="round"
        strokeDasharray="8 12"
        className={reduceMotion ? "" : "animate-silk-flow"}
      />
    </>
  );
};
