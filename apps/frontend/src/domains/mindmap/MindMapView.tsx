import React from "react";
import { motion } from "framer-motion";
import { StarSeaCanvas } from "../universe/StarSeaCanvas";
import { useUiStore } from "../../store/uiStore";

const STAR_POINTS = [
  { top: "12%", left: "18%", size: 6, delay: 0.1 },
  { top: "18%", left: "72%", size: 4, delay: 0.6 },
  { top: "26%", left: "84%", size: 5, delay: 1.2 },
  { top: "32%", left: "10%", size: 4, delay: 0.9 },
  { top: "40%", left: "66%", size: 7, delay: 0.3 },
  { top: "48%", left: "22%", size: 5, delay: 1.5 },
  { top: "58%", left: "88%", size: 4, delay: 0.7 },
  { top: "64%", left: "14%", size: 6, delay: 1.1 },
  { top: "70%", left: "52%", size: 5, delay: 0.5 },
  { top: "78%", left: "80%", size: 7, delay: 1.4 },
  { top: "84%", left: "30%", size: 4, delay: 0.2 },
  { top: "88%", left: "62%", size: 5, delay: 0.8 },
];

export const MindMapView: React.FC = () => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  return (
    <div className="absolute inset-0 z-10 overflow-hidden bg-[#050816] dark:bg-[#03050d]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_20%,rgba(119,170,255,0.2),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(255,168,214,0.22),transparent_30%),radial-gradient(circle_at_50%_62%,rgba(132,115,255,0.16),transparent_42%),radial-gradient(circle_at_50%_100%,rgba(110,182,255,0.18),transparent_38%)]" />
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_20%,transparent_80%,rgba(255,255,255,0.03))]" />

      <StarSeaCanvas />

      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(circle at center, black 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, black 35%, transparent 100%)",
        }}
      />

      <div className="absolute inset-0 pointer-events-none">
        {STAR_POINTS.map((star) => (
          <motion.span
            key={`${star.top}-${star.left}`}
            className="absolute rounded-full bg-white"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              boxShadow: "0 0 18px rgba(255,255,255,0.9)",
            }}
            animate={
              reduceMotion
                ? undefined
                : {
                    opacity: [0.35, 1, 0.45],
                    scale: [1, 1.35, 1],
                  }
            }
            transition={
              reduceMotion
                ? undefined
                : {
                    duration: 3.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: star.delay,
                  }
            }
          />
        ))}
      </div>

      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0.25 : 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 flex items-center justify-center px-6"
      >
        <div className="relative w-full max-w-3xl overflow-hidden rounded-[2.25rem] border border-white/15 bg-white/10 px-8 py-10 text-center shadow-[0_0_80px_rgba(85,140,255,0.18)] backdrop-blur-2xl sm:px-14 sm:py-14 dark:bg-white/[0.06]">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-80" />
          <div className="absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#8cb6ff]/20 blur-3xl" />
          <div className="absolute -bottom-28 right-8 h-44 w-44 rounded-full bg-[#ff9fd1]/16 blur-3xl" />

          <div className="relative space-y-5">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1 text-[11px] tracking-[0.28em] text-white/75">
              MEMORY SEA
            </div>
            <h1 className="font-elysia-display text-2xl text-white/90 sm:text-3xl">
              记忆织网
            </h1>
            <p className="font-elysia-poem text-2xl leading-relaxed text-white/90 sm:text-4xl">
              记忆，等待被唤醒，要用爱铭记我~🎶
            </p>
            <p className="mx-auto max-w-none whitespace-nowrap text-[clamp(0.5rem,1.55vw,1rem)] leading-normal text-white/60">
              星光还在静静流动，等这一片织网再次醒来时，它会把每一缕温柔都重新串联起来。
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
