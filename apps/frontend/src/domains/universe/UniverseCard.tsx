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
    const blur = reduceMotion ? 0 : d * 5; // 0~5px
    const opacity = 1 - d * 0.55; // 1~0.45
    const scale = 1 - d * 0.25; // 1~0.75
    const zIndex = Math.round((1 - d) * 30);

    // 是否是近焦点（距离 < 0.3）
    const isNear = d < 0.3;
    // 远处卡片禁用交互
    const pointerEvents = d > 0.7 ? "none" as const : "auto" as const;

    // 智能内容显示：标题截断
    const maxTitleLen = 30;
    const displayTitle = title.length > maxTitleLen
      ? title.slice(0, maxTitleLen) + "…"
      : title;

    // 是否显示金句：标题不太长 + showQuote 标记 + 有金句
    const shouldShowQuote = showQuote && quote && title.length <= 20;
    const displayQuote = shouldShowQuote
      ? (quote!.length > 40 ? quote!.slice(0, 40) + "…" : quote)
      : null;

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
      triggerRipple(
        e.clientX || 0,
        e.clientY || 0,
        colorMap[emojiType] || "rgba(255, 182, 193, 0.4)"
      );
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
          "w-64 overflow-hidden rounded-2xl p-4 cursor-pointer relative",
          reduceMotion
            ? "bg-white/70 dark:bg-black/70 border border-white/60 dark:border-white/20"
            : "bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/60 dark:border-white/20",
          "shadow-[var(--shadow-crystal)] dark:shadow-none",
          "transition-[filter,opacity] duration-500",
          reduceMotion
            ? "hover:bg-white/80 dark:hover:bg-black/80"
            : "hover:bg-white/50 dark:hover:bg-white/10 hover:border-white/80 hover:shadow-[var(--shadow-liquid),var(--shadow-glow)]",
          className,
        )}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
          if (!reduceMotion && isNear) {
            triggerRipple(e.clientX, e.clientY, "rgba(255, 182, 193, 0.4)");
          }
        }}
        {...props}
      >
        {/* 波浪容器 */}
        <div className="absolute inset-0 z-0 overflow-hidden rounded-2xl pointer-events-none">
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
        {isNear && (
          <div
            className="absolute -inset-3 rounded-3xl pointer-events-none -z-10"
            style={{
              background: "radial-gradient(ellipse at center, var(--elysia-petal) 0%, transparent 70%)",
              boxShadow: "0 0 40px 8px var(--elysia-petal)",
            }}
          />
        )}

        {/* 近焦点花瓣装饰 */}
        {isNear && !reduceMotion && (
          <svg
            className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] pointer-events-none z-[1]"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="petal-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--elysia-butterfly)" stopOpacity="0.35" />
                <stop offset="50%" stopColor="var(--elysia-crystal)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--elysia-bowstring)" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <path d="M 8,2 Q 5,5 2,8" stroke="url(#petal-border-grad)" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            <path d="M 92,2 Q 95,5 98,8" stroke="url(#petal-border-grad)" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            <path d="M 2,92 Q 5,95 8,98" stroke="url(#petal-border-grad)" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            <path d="M 98,92 Q 95,95 92,98" stroke="url(#petal-border-grad)" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            <path d="M 45,1 Q 50,-1 55,1" stroke="var(--elysia-butterfly)" strokeWidth="0.5" fill="none" opacity="0.3" strokeLinecap="round" />
            <path d="M 45,99 Q 50,101 55,99" stroke="var(--elysia-butterfly)" strokeWidth="0.5" fill="none" opacity="0.3" strokeLinecap="round" />
          </svg>
        )}

        {/* 玻璃反射 */}
        <div className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-inset ring-white/20 mix-blend-overlay z-10" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none opacity-50 z-10" />

        {/* 内容 */}
        <div className="relative z-20 flex flex-col gap-2">
          {/* 心情 tag — 始终显示 */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-gradient-to-r from-[var(--elysia-butterfly)]/20 to-[var(--elysia-crystal)]/20 text-slate-600 dark:text-slate-300 border border-[var(--elysia-butterfly)]/15"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 标题 */}
          <p className="font-elysia-display text-sm leading-relaxed text-slate-700 dark:text-slate-200 line-clamp-2">
            {displayTitle}
          </p>

          {/* 金句（随机显示） */}
          {displayQuote && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic border-l-2 border-[var(--elysia-lavender)]/30 pl-2 line-clamp-2">
              {displayQuote}
            </p>
          )}

          {/* 底部信息 */}
          <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/20 dark:border-white/10">
            <span className="font-elysia-display text-xs bg-gradient-to-r from-rose-400 to-cyan-400 bg-clip-text text-transparent">
              {author}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-300/80">
              {time}
            </span>
          </div>
        </div>
      </motion.div>
    );
  }
);

UniverseCard.displayName = "UniverseCard";
