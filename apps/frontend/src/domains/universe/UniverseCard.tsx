import React, { useRef, useState, useEffect } from "react";
import {
  motion,
  useAnimation,
  type HTMLMotionProps,
} from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useUiStore } from "../../store/uiStore";
import { MarkdownText } from "../../components/ui/MarkdownText";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface UniverseCardProps extends HTMLMotionProps<"div"> {
  x: number;
  y: number;
  content: string;
  time: string;
  author: string;
  focusRank: number; // 0 = primary, 1-2 = secondary, -1 = far
}

export const UniverseCard = React.forwardRef<HTMLDivElement, UniverseCardProps>(
  (
    {
      x,
      y,
      content,
      time,
      author,
      focusRank,
      className,
      ...props
    },
    ref,
  ) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const reduceMotion = useUiStore((state) => state.reduceMotion);

    // Ripple effect state
    const [ripples, setRipples] = useState<{ id: number; color: string; x: number; y: number }[]>([]);
    const controls = useAnimation();

    // Handle drag drop detection (mocking interaction)
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      // Create a ripple where the drop happened
      // Normally we'd extract the emoji/type from dataTransfer, but framer-motion doesn't use standard drag events easily
      // We simulate by clicking or checking boundaries
      triggerRipple(e.clientX || 0, e.clientY || 0, "rgba(255, 105, 180, 0.5)"); // Default pink ripple
    };

    const triggerRipple = (clientX: number, clientY: number, color: string) => {
      if (reduceMotion) return;

      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      // Calculate position relative to card
      const rippleX = clientX - rect.left;
      const rippleY = clientY - rect.top;

      const newRipple = {
        id: Date.now(),
        color,
        x: rippleX,
        y: rippleY,
      };

      setRipples((prev) => [...prev, newRipple]);

      // Remove after animation completes
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 1000);
    };

    // Style overrides based on focus rank
    // 1主焦点 + 2副焦点规则
    const isPrimary = focusRank === 0;
    const isSecondary = focusRank === 1 || focusRank === 2;
    const isFar = focusRank === -1;

    let targetScale = 1;
    let targetOpacity = 1;
    let targetBlur = "blur(0px)";
    let zIndex = 0;

    if (isPrimary) {
      targetScale = 1.1;
      targetOpacity = 1;
      zIndex = 50;
    } else if (isSecondary) {
      targetScale = 0.95;
      targetOpacity = 0.6;
      targetBlur = "blur(2px)";
      zIndex = 40;
    } else {
      // 远处的卡片极大程度地淡出甚至直接隐藏
      targetScale = 0.8;
      targetOpacity = 0.05; // 几乎透明
      targetBlur = "blur(8px)";
      zIndex = 10;
    }

    if (reduceMotion) {
      targetScale = 1;
      targetBlur = "none";
      // In reduced motion, still apply opacity logic but simpler
      if (isFar) targetOpacity = 0.1;
    }

    useEffect(() => {
      controls.start({
        scale: targetScale,
        opacity: targetOpacity,
        filter: targetBlur,
        transition: { type: "spring", stiffness: 300, damping: 30 },
      });
    }, [focusRank, targetScale, targetOpacity, targetBlur, controls]);

    // Add pointer events logic - if far, disable interactions
    const pointerEvents = isFar ? "none" : "auto";

    return (
      <motion.div
        ref={(node: HTMLDivElement | null) => {
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
          if (cardRef && node) cardRef.current = node;
        }}
        initial={{ scale: targetScale, opacity: targetOpacity }}
        animate={controls}
        style={{
          x,
          y,
          zIndex,
          position: "absolute",
          transformOrigin: "center center",
          pointerEvents,
        }}
        className={cn(
          "w-72 overflow-hidden rounded-2xl p-5 cursor-pointer relative",
          reduceMotion
            ? "bg-white/70 dark:bg-black/70 border border-white/60 dark:border-white/20"
            : "bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/60 dark:border-white/20",
          "shadow-[var(--shadow-crystal)] dark:shadow-none",
          "transition-colors duration-300",
          reduceMotion
            ? "hover:bg-white/80 dark:hover:bg-black/80"
            : "hover:bg-white/50 dark:hover:bg-white/10 hover:border-white/80 hover:shadow-[var(--shadow-liquid)] hover:shadow-[var(--shadow-glow)]",
          className,
        )}
        onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          handleDrop(e);
        }}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
          // Fallback interaction testing for ripples
          if (!reduceMotion && isPrimary) {
            triggerRipple(e.clientX, e.clientY, "rgba(255, 182, 193, 0.4)");
          }
        }}
        {...props}
      >
        {/* Ripple Container */}
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

        {/* Subtle Inner Reflection */}
        <div className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-inset ring-white/20 mix-blend-overlay z-10" />

        {/* Glass Edge Highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none opacity-50 z-10" />

        <div className="relative z-20 flex flex-col gap-3">
          <MarkdownText content={content} className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed font-medium" />
          <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/20 dark:border-white/10">
            <span className="text-xs font-semibold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              {author}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {time}
            </span>
          </div>
        </div>
      </motion.div>
    );
  }
);

UniverseCard.displayName = "UniverseCard";
