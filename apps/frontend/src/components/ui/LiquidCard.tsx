import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, type HTMLMotionProps } from "framer-motion";
import { useUiStore } from "../../store/uiStore";
import { getTransition } from "../../lib/animations";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface LiquidCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  glowOnHover?: boolean;
}

export const LiquidCard = React.forwardRef<HTMLDivElement, LiquidCardProps>(
  ({ children, className, glowOnHover = true, ...props }, ref) => {
    const reduceMotion = useUiStore((state) => state.reduceMotion);

    return (
      <motion.div
        ref={ref}
        whileHover={
          glowOnHover && !reduceMotion ? { scale: 1.02, y: -5 } : undefined
        }
        transition={getTransition(reduceMotion)}
        className={cn(
          "relative rounded-[2rem] p-6",
          // 在 reduceMotion 开启时降级背景模糊为普通半透明背景
          reduceMotion
            ? "bg-white/70 dark:bg-black/40 border border-white/60 dark:border-white/10"
            : "bg-white/40 dark:bg-black/30 backdrop-blur-xl border border-white/60 dark:border-white/10",
          "shadow-[var(--shadow-crystal)]",
          "transition-all duration-[var(--transition-main)] ease-out",
          glowOnHover &&
            (reduceMotion
              ? "hover:bg-white/80 dark:hover:bg-black/60"
              : "hover:bg-white/50 dark:hover:bg-black/40 hover:border-white/80 dark:hover:border-white/20 hover:shadow-[var(--shadow-liquid)] hover:shadow-[var(--shadow-glow)]"),
          className,
        )}
        {...props}
      >
        {/* Subtle Inner Reflection */}
        <div className="absolute inset-0 rounded-[2rem] pointer-events-none ring-1 ring-inset ring-white/20 dark:ring-white/5 mix-blend-overlay" />

        {/* Glass Edge Highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/30 to-transparent pointer-events-none opacity-50" />

        <div className="relative z-10">{children}</div>
      </motion.div>
    );
  },
);

LiquidCard.displayName = "LiquidCard";
