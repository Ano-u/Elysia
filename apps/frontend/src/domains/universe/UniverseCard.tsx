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

// eslint-disable-next-line react-refresh/only-export-components
export const REACTION_EMOJIS: Record<string, string> = {
  heart: "💖",
  hug: "🫂",
  star: "✨",
  butterfly: "🦋",
  flower: "🌸",
};

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
  /** 表情拖入时的回调。如果返回 false，表示重复操作并拒绝波浪动画 */
  onReaction?: (emojiType: string) => boolean | void;
  /** 外部传入的表情反应数量记录 */
  reactions?: Record<string, number>;
}

// 心情映射辅助函数
// eslint-disable-next-line react-refresh/only-export-components
export const getEmotionConfig = (tag: string) => {
  const configs: Record<string, { icon: string; color: string; bgClass: string; textClass: string; borderClass: string }> = {
    '开心': { icon: '♥', color: '#ff69b4', bgClass: 'bg-pink-100/50 dark:bg-pink-900/30', textClass: 'text-pink-600 dark:text-pink-300', borderClass: 'border-pink-200 dark:border-pink-800' },
    '快乐': { icon: '♪', color: '#ff69b4', bgClass: 'bg-pink-100/50 dark:bg-pink-900/30', textClass: 'text-pink-600 dark:text-pink-300', borderClass: 'border-pink-200 dark:border-pink-800' },
    '激动': { icon: '✨', color: '#ffd700', bgClass: 'bg-yellow-100/50 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-300', borderClass: 'border-yellow-200 dark:border-yellow-800' },
    '难过': { icon: '💧', color: '#87ceeb', bgClass: 'bg-blue-100/50 dark:bg-blue-900/30', textClass: 'text-blue-600 dark:text-blue-300', borderClass: 'border-blue-200 dark:border-blue-800' },
    '悲伤': { icon: '🌧️', color: '#4682b4', bgClass: 'bg-indigo-100/50 dark:bg-indigo-900/30', textClass: 'text-indigo-600 dark:text-indigo-300', borderClass: 'border-indigo-200 dark:border-indigo-800' },
    '生气': { icon: '🔥', color: '#ff4500', bgClass: 'bg-red-100/50 dark:bg-red-900/30', textClass: 'text-red-600 dark:text-red-300', borderClass: 'border-red-200 dark:border-red-800' },
    '平静': { icon: '🍃', color: '#98fb98', bgClass: 'bg-teal-100/50 dark:bg-teal-900/30', textClass: 'text-teal-600 dark:text-teal-300', borderClass: 'border-teal-200 dark:border-teal-800' },
    '期待': { icon: '🌟', color: '#ffa500', bgClass: 'bg-orange-100/50 dark:bg-orange-900/30', textClass: 'text-orange-600 dark:text-orange-300', borderClass: 'border-orange-200 dark:border-orange-800' },
    '疲惫': { icon: '🌙', color: '#9370db', bgClass: 'bg-slate-100/50 dark:bg-slate-800/30', textClass: 'text-slate-600 dark:text-slate-300', borderClass: 'border-slate-200 dark:border-slate-700' },
    'emo': { icon: '🥀', color: '#dda0dd', bgClass: 'bg-purple-100/50 dark:bg-purple-900/30', textClass: 'text-purple-600 dark:text-purple-300', borderClass: 'border-purple-200 dark:border-purple-800' }
  };
  
  // 默认样式
  return configs[tag] || { 
    icon: '🌸', 
    color: '#f0b6d6', 
    bgClass: 'bg-[var(--elysia-butterfly)]/10', 
    textClass: 'text-slate-600 dark:text-slate-300', 
    borderClass: 'border-[var(--elysia-butterfly)]/20' 
  };
};

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
      reactions = {},
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
    // 将焦点范围从 0.3 扩大到 0.45
    const inFocusRange = d < 0.45;
    const isCenter = isActive || inFocusRange;
    
    // 模糊程度降低，让稍微远一点的也可见
    const blur = reduceMotion ? 0 : isCenter ? 0 : Math.pow(Math.max(0, d - 0.35), 1.5) * 8; 
    const opacity = isCenter ? 1 : Math.max(0.4, 1 - d * 0.7);
    const scale = isActive ? 1.05 : isCenter ? 1 : Math.max(0.75, 1 - d * 0.25);
    const zIndex = isActive ? 50 : isCenter ? 40 : Math.round((1 - d) * 30) + 10;

    // 远处卡片禁用交互的距离也放宽
    const pointerEvents = d > 0.8 ? "none" as const : "auto" as const;

    // 处理表情拖入
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const emojiType = e.dataTransfer.getData("text/emoji-type");
      if (emojiType && onReaction) {
        const success = onReaction(emojiType);
        // 如果外部明确返回 false，说明重复反应，不播放涟漪和爆炸动画
        if (success === false) {
          return;
        }
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
          "w-64 rounded-3xl p-5 cursor-pointer relative flex flex-col gap-3",
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
          if (props.onClick) {
            props.onClick(e);
          }
        }}
        {...props}
      >
        {/* 波浪容器 */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-3xl">
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

        {/* 右上角浮动标签 (Floating Tags) */}
        {tags.length > 0 && (
          <div className="absolute -top-3 -right-3 flex flex-col items-end gap-1.5 z-30 pointer-events-none">
            {(() => {
              // 从标签列表中最多选出2个
              const displayTags = tags.slice(0, 2);
              return displayTags.map((tag, idx) => {
                const config = getEmotionConfig(tag);
                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + idx * 0.1 }}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border shadow-[0_4px_10px_rgba(0,0,0,0.1)] backdrop-blur-md",
                      config.bgClass.replace('/50', '/90').replace('/30', '/80'), // 加深一点背景使其在边缘更清晰
                      config.textClass,
                      config.borderClass
                    )}
                  >
                    <span className="text-[12px]">{config.icon}</span>
                    {tag}
                  </motion.div>
                );
              });
            })()}
          </div>
        )}

        {/* 内容 */}
        <div className="relative z-20 flex flex-col h-full justify-between gap-2">
          
          <div className="flex flex-col gap-2">
            {/* Header: Time & Placeholder for tags */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                {time}
              </span>
              {/* 占位，防止右上角的标题文字和外部的 Tag 标签在视觉上挤在一起 */}
              <div className="h-4 w-12 shrink-0 pointer-events-none"></div>
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

          {/* 底部信息 - Author & Reactions */}
          <div className="flex items-center mt-2 pt-3 border-t border-slate-200/50 dark:border-white/10 justify-between">
            <span className="font-elysia-display text-xs font-semibold bg-gradient-to-r from-rose-400 to-violet-400 bg-clip-text text-transparent truncate max-w-[100px]">
              {author}
            </span>
            {reactions && Object.keys(reactions).length > 0 && (
              <div className="flex items-center gap-1.5 overflow-hidden">
                {Object.entries(reactions).slice(0, 3).map(([emojiType, count]) => (
                  <div key={emojiType} className="flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400 bg-white/40 dark:bg-black/20 rounded-full px-1.5 py-0.5">
                    <span>{REACTION_EMOJIS[emojiType] || "✨"}</span>
                    <span className="text-[9px]">{count > 99 ? '99+' : count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </motion.div>
    );
  }
);

UniverseCard.displayName = "UniverseCard";
