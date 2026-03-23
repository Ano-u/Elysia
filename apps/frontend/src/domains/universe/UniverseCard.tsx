import React, { useRef, useState } from "react";
import {
  motion,
  type HTMLMotionProps,
} from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useUiStore } from "../../store/uiStore";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface UniverseCardProps extends HTMLMotionProps<"div"> {
  x: number;
  y: number;
  /** 心情短语（标题） */
  title: string;
  /** 金句/誓言 */
  quote?: string | null;
  /** 心情 tag 列表 */
  tags: string[];
  /** 是否显示金句（由父组件随机决定） */
  showQuote: boolean;
  time: string;
  author: string;
  /** 到视口中心的归一化距离 0~1，0=正中心 1=最远 */
  distanceRatio: number;
  /** 是否为当前最靠近中心的活跃卡片 */
  isActive?: boolean;
  /** 表情拖入时的回调 */
  onReaction?: (emojiType: string) => void;
}

export const UniverseCard = React.forwardRef<HTMLDivElement, UniverseCardProps>(
  (
    {
      x,
      y,
      title,
      quote,
      tags,
      showQuote,
      time,
      author,
      distanceRatio,
      isActive = false,
      onReaction,
      className,
      ...props
    },
    ref,
  ) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const reduceMotion = useUiStore((state) => state.reduceMotion);

    // 波浪效果
    const [ripples, setRipples] = useState<{ id: number; color: string; x: number; y: number }[]>([]);

    const triggerRipple = (clientX: number, clientY: number, color: string) => {
      if (reduceMotion) return;
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const newRipple = {
        id: Date.now(),
        color,
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
      setRipples((prev) => [...prev, newRipple]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 1000);
    };

    // 景深模糊：基于到视口中心的距离连续计算
    const d = Math.min(Math.max(distanceRatio, 0), 1);
    
    // 扩大清晰范围：距离中心近的多个卡片都保持清晰
    const inFocusRange = d < 0.3;
    const isCenter = isActive || inFocusRange;
    
    const blur = reduceMotion ? 0 : isCenter ? 0 : Math.pow(Math.max(0, d - 0.2), 1.2) * 12; 
    const opacity = isCenter ? 1 : Math.max(0.3, 1 - d * 0.8);
    const scale = isActive ? 1.05 : isCenter ? 1 : Math.max(0.7, 1 - d * 0.3);
    const zIndex = isActive ? 50 : isCenter ? 40 : Math.round((1 - d) * 30) + 10;

    // 远处卡片禁用交互
    const pointerEvents = d > 0.6 ? "none" as const : "auto" as const;

    // 处理表情拖入
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const emojiType = e.dataTransfer.getData("text/emoji-type");
      if (emojiType && onReaction) {
        onReaction(emojiType);
      }
      // 波浪效果
      const colorMap: Record<string, string> = {
        heart: "rgba(255, 105, 180, 0.5)",
        hug: "rgba(255, 200, 100, 0.5)",
        star: "rgba(255, 230, 120, 0.5)",
        butterfly: "rgba(200, 162, 232, 0.5)",
        flower: "rgba(240, 182, 214, 0.5)",
      };
      
      const cx = e.clientX || window.innerWidth / 2;
      const cy = e.clientY || window.innerHeight / 2;

      triggerRipple(cx, cy, colorMap[emojiType] || "rgba(255, 182, 193, 0.4)");
      
      // 触发 Canvas 水晶飞花粒子
      window.dispatchEvent(new CustomEvent('star-sea-explosion', { 
        detail: { x: cx, y: cy } 
      }));
    };

    return (
      <motion.div
        ref={(node: HTMLDivElement | null) => {
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
          if (cardRef && node) cardRef.current = node;
        }}
        style={{
          x,
          y,
          zIndex,
          position: "absolute",
          transformOrigin: "center center",
          pointerEvents,
          scale,
          opacity,
          filter: `blur(${blur}px)`,
        }}
        className={cn(
          "w-64 rounded-3xl p-5 cursor-pointer relative overflow-hidden flex flex-col gap-3",
          reduceMotion
            ? "bg-white/80 dark:bg-slate-800/80"
            : "bg-white/50 dark:bg-[#1a1a1e]/60 backdrop-blur-2xl saturate-[1.5]",
          "border border-white/50 dark:border-white/10",
          isCenter
            ? "shadow-[0_20px_40px_rgba(0,0,0,0.1),0_0_20px_rgba(255,255,255,0.4)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.3),0_0_20px_rgba(255,255,255,0.1)]"
            : "shadow-[0_8px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]",
          "transition-all duration-500 ease-out",
          className,
        )}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
          if (!reduceMotion && isCenter) {
            triggerRipple(e.clientX, e.clientY, "rgba(255, 182, 193, 0.4)");
          }
        }}
        {...props}
      >
        {/* 波浪容器 */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {ripples.map((ripple) => (
            <motion.div
              key={ripple.id}
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 4, opacity: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
              style={{
                position: "absolute",
                left: ripple.x,
                top: ripple.y,
                width: 100,
                height: 100,
                marginLeft: -50,
                marginTop: -50,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${ripple.color} 0%, transparent 70%)`,
                boxShadow: `0 0 20px 5px ${ripple.color}`,
              }}
            />
          ))}
        </div>

        {/* 近焦点光晕 */}
        {isCenter && (
          <div
            className="absolute -inset-3 rounded-3xl pointer-events-none -z-10"
            style={{
              background: "radial-gradient(ellipse at center, var(--elysia-petal) 0%, transparent 70%)",
              boxShadow: "0 0 40px 8px var(--elysia-petal)",
            }}
          />
        )}

        {/* 玻璃反射 */}
        <div className="absolute inset-0 rounded-3xl pointer-events-none ring-1 ring-inset ring-white/30 mix-blend-overlay z-10" />
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none opacity-60 z-10" />

        {/* 内容 */}
        <div className="relative z-20 flex flex-col h-full justify-between gap-2">
          
          <div className="flex flex-col gap-2">
            {/* Header: Tag + Time */}
            <div className="flex items-center justify-between">
              {tags.length > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gradient-to-r from-[var(--elysia-butterfly)]/30 to-[var(--elysia-crystal)]/30 text-slate-700 dark:text-slate-200 border border-[var(--elysia-butterfly)]/20 shadow-sm">
                  {tags[0]}
                </span>
              ) : (
                <div />
              )}
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {time}
              </span>
            </div>

            {/* 标题 */}
            <h3 className="font-elysia-display text-base font-bold leading-snug text-slate-800 dark:text-slate-100 line-clamp-3 break-words [overflow-wrap:anywhere] mt-1">
              {title}
            </h3>

            {/* 金句（随机显示） */}
            {showQuote && quote && (
              <p className="text-sm text-slate-500 dark:text-slate-400 italic line-clamp-2 text-ellipsis overflow-hidden mt-0.5">
                {quote}
              </p>
            )}
          </div>

          {/* 底部信息 - Author */}
          <div className="flex items-center mt-2 pt-3 border-t border-slate-200/50 dark:border-white/10">
            <span className="font-elysia-display text-xs font-semibold bg-gradient-to-r from-rose-400 to-violet-400 bg-clip-text text-transparent">
              {author}
            </span>
          </div>

        </div>
      </motion.div>
    );
  }
);

UniverseCard.displayName = "UniverseCard";
