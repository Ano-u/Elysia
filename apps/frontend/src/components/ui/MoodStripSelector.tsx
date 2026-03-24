import React from "react";
import { motion } from "framer-motion";
import { PREDEFINED_TAGS } from "./MainInputCard";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface MoodStripSelectorProps {
  extraEmotions: string[];
  onToggle: (tag: string) => void;
  className?: string;
}

export const MoodStripSelector: React.FC<MoodStripSelectorProps> = ({
  extraEmotions,
  onToggle,
  className,
}) => {
  return (
    <div
      className={twMerge(
        "relative flex justify-center items-center gap-[10px] py-12 px-2 overflow-visible",
        className
      )}
    >
      {PREDEFINED_TAGS.map((tag, i) => {
        const isSelected = extraEmotions.includes(tag);
        const isEven = i % 2 === 0;

        // Static stagger amount for the "wave" look
        const staggerY = isEven ? 24 : -24;

        // Strip dimensions
        const stripWidth = 36; // thinner
        const stripGap = 10;
        const step = stripWidth + stripGap;
        
        // Total width calculations to ensure the background image maps nicely
        // Use a large enough width to guarantee the height covers the 260px strip (plus stagger)
        const bgWidth = 700; 
        const bgSize = `${bgWidth}px auto`;
        
        // Center the background horizontally across all strips
        const totalStripsWidth = PREDEFINED_TAGS.length * step - stripGap;
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
            className="relative"
          >
            <motion.button
              type="button"
              onClick={() => onToggle(tag)}
              animate={{ y: [-3, 3, -3] }}
              transition={{
                duration: 4,
                ease: "easeInOut",
                repeat: Infinity,
                delay: i * 0.3, // offset the floating phase
              }}
              style={{
                width: stripWidth,
                height: 260, // uniformly long, taller than before
                backgroundImage: "url('/mood-bg.png')",
                backgroundSize: bgSize,
                backgroundPosition: `${bgPosX} ${bgPosY}`,
                backgroundRepeat: "no-repeat",
              }}
              className={clsx(
                "relative flex flex-col items-center justify-center rounded-full border-2 transition-all duration-300 overflow-hidden shrink-0",
                isSelected
                  ? "border-pink-300/90 ring-4 ring-pink-400/40 scale-105 z-10 brightness-110 shadow-[0_0_24px_rgba(244,114,182,0.8)]"
                  : "border-white/20 opacity-80 hover:opacity-100 hover:scale-[1.02] brightness-[0.8] hover:brightness-100 grayscale-[0.3] shadow-lg"
              )}
            >
              {/* Inner gradient overlay to ensure text is readable */}
              <div className="absolute inset-0 bg-black/20 pointer-events-none mix-blend-overlay transition-opacity duration-300" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40 pointer-events-none" />

              {/* Glowing text for the tag */}
              <span
                style={{ writingMode: "vertical-rl" }}
                className={clsx(
                  "relative z-10 text-sm font-bold tracking-[0.3em] transition-all duration-300 py-4",
                  isSelected
                    ? "text-white drop-shadow-[0_0_10px_rgba(255,255,255,1)]"
                    : "text-white/80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                )}
              >
                {tag}
              </span>
            </motion.button>
          </motion.div>
        );
      })}
    </div>
  );
};
