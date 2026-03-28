import React from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface MoodStripSelectorProps {
  mode?: "main" | "extra";
  items: string[];
  rotatingItems?: string[];
  selectedItems: string[];
  onToggle: (tag: string) => void;
  className?: string;
  customMoodPhrase?: string;
  onCustomMoodPhraseChange?: (val: string) => void;
  customMoodError?: string | null;
}

export const MoodStripSelector: React.FC<MoodStripSelectorProps> = ({
  mode = "extra",
  items,
  rotatingItems = [],
  selectedItems,
  onToggle,
  className,
  customMoodPhrase,
  onCustomMoodPhraseChange,
  customMoodError,
}) => {
  const getDisplayLabel = (tag: string) => {
    if (tag === "custom") return "自定义情绪";
    return tag;
  };

  const isCustomSelected = selectedItems.includes("custom");

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div
        className={twMerge(
          "relative flex justify-start sm:justify-center items-center py-12 px-4 overflow-x-auto hide-scrollbar w-full max-w-full",
          mode === "main" ? "gap-[8px]" : "gap-[10px]",
          className
        )}
      >
      {items.map((tag: string, i: number) => {
        const isSelected = selectedItems.includes(tag);
        const isRotating = rotatingItems.includes(tag);
        const isEven = i % 2 === 0;

        // Static stagger amount for the "wave" look
        const staggerY = isEven ? 24 : -24;

        // Strip dimensions
        const stripWidth = mode === "main" ? 32 : 36; // thinner to fit 10 items
        const stripGap = mode === "main" ? 8 : 10;
        const step = stripWidth + stripGap;

        // Total width calculations to ensure the background image maps nicely
        const bgWidth = 800;
        const bgSize = `${bgWidth}px auto`;

        // Center the background horizontally across all strips
        const totalStripsWidth = items.length * step - stripGap;
        const startX = (bgWidth - totalStripsWidth) / 2;
        const bgPosX = `-${startX + i * step}px`;

        // Offset the Y position to perfectly counter the stagger, keeping the image continuous
        const bgPosY = `calc(30% + ${-staggerY}px)`;

        return (
          <motion.div
            key={tag}
            initial={{ opacity: 0, y: isEven ? 100 : -100 }}
            animate={{ opacity: 1, y: staggerY }}
            transition={{
              type: "spring",
              stiffness: 70,
              damping: 15,
              delay: i * 0.1,
            }}
            className="relative shrink-0"
          >
            <motion.button
              type="button"
              onClick={() => onToggle(tag)}
              animate={{ y: [-3, 3, -3] }}
              transition={{
                duration: 4,
                ease: "easeInOut",
                repeat: Infinity,
                delay: i * 0.3,
              }}
              style={{
                width: stripWidth,
                height: 260,
                backgroundImage: "url('/mood-bg.webp')",
                backgroundSize: bgSize,
                backgroundPosition: `${bgPosX} ${bgPosY}`,
                backgroundRepeat: "no-repeat",
              }}
              className={clsx(
                "relative flex flex-col items-center justify-center rounded-full border-2 transition-all duration-300 overflow-hidden",
                isSelected
                  ? "border-pink-300/90 ring-4 ring-pink-400/40 scale-105 z-10 brightness-110 shadow-[0_0_24px_rgba(244,114,182,0.8)]"
                  : isRotating 
                    ? "border-white/10 opacity-60 hover:opacity-80 hover:scale-[1.02] brightness-[0.7] hover:brightness-90 grayscale-[0.5] shadow-sm"
                    : "border-white/20 opacity-80 hover:opacity-100 hover:scale-[1.02] brightness-[0.8] hover:brightness-100 grayscale-[0.3] shadow-lg"
              )}
            >
              <div className="absolute inset-0 bg-black/20 pointer-events-none mix-blend-overlay transition-opacity duration-300" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40 pointer-events-none" />

              <span
                style={{ writingMode: "vertical-rl" }}
                className={clsx(
                  "relative z-10 text-sm font-bold tracking-[0.3em] transition-all duration-300 py-4",
                  tag === "custom" || isRotating ? "text-xs" : "",
                  isSelected
                    ? "text-white drop-shadow-[0_0_10px_rgba(255,255,255,1)]"
                    : "text-white/80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                )}
              >
                {getDisplayLabel(tag)}
              </span>
            </motion.button>
          </motion.div>
        );
      })}
      </div>
      {isCustomSelected && onCustomMoodPhraseChange && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -10 }}
          animate={{ opacity: 1, height: "auto", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -10 }}
          className="w-full max-w-md px-4"
        >
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={customMoodPhrase || ""}
              onChange={(e) => onCustomMoodPhraseChange(e.target.value)}
              placeholder="自定义你的专属情绪（中文最多5个字，英文最多2个词）"
              className="w-full bg-white/20 dark:bg-black/20 border-none rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-300/50 shadow-inner placeholder:text-slate-500/50"
            />
            {customMoodError && (
              <span className="text-xs text-red-500/90 pl-2">{customMoodError}</span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};
