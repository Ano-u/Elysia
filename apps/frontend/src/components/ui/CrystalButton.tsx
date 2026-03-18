import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, type HTMLMotionProps } from "framer-motion";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CrystalButtonProps extends Omit<
  HTMLMotionProps<"button">,
  "ref"
> {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
}

export const CrystalButton = React.forwardRef<
  HTMLButtonElement,
  CrystalButtonProps
>(
  (
    { children, className, variant = "primary", size = "md", ...props },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-[var(--background)]";

    const variants: Record<NonNullable<CrystalButtonProps["variant"]>, string> = {
      primary:
        "bg-white/80 dark:bg-black/40 text-[var(--foreground)] hover:bg-white dark:hover:bg-black/60 border border-white dark:border-white/20 shadow-[var(--shadow-crystal)] hover:shadow-[var(--shadow-liquid)] hover:shadow-[var(--shadow-glow)] backdrop-blur-xl",
      secondary:
        "bg-white/40 dark:bg-black/20 text-[var(--foreground)] hover:bg-white/60 dark:hover:bg-black/40 border border-white/50 dark:border-white/10 backdrop-blur-lg",
      outline:
        "border-2 border-white/60 dark:border-white/20 bg-transparent text-[var(--foreground)] hover:bg-white/20 dark:hover:bg-white/10 backdrop-blur-sm",
      ghost:
        "hover:bg-white/30 dark:hover:bg-white/10 hover:text-[var(--foreground)] text-[var(--muted-foreground)] backdrop-blur-sm",
    };

    const sizes: Record<NonNullable<CrystalButtonProps["size"]>, string> = {
      sm: "h-9 px-3 text-xs",
      md: "h-10 py-2 px-4 text-sm",
      lg: "h-11 px-8 rounded-2xl text-base",
      icon: "h-10 w-10",
    };

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 17,
        }}
        className={cn(
          baseStyles,
          variants[variant as NonNullable<CrystalButtonProps["variant"]>],
          sizes[size as NonNullable<CrystalButtonProps["size"]>],
          "relative overflow-hidden group",
          className,
        )}
        {...props}
      >
        {/* Subtle Shine Effect */}
        <span className="absolute inset-0 z-0 overflow-hidden rounded-xl">
          <span className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-white/0 via-white/40 to-white/0 transform -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
        </span>

        {/* Button Content */}
        <span className="relative z-10 flex items-center justify-center gap-2">
          {children}
        </span>
      </motion.button>
    );
  },
);

CrystalButton.displayName = "CrystalButton";
