import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PanInfo } from "framer-motion";
import { Compass, Network, Send } from "lucide-react";
import { useUiStore } from "../../store/uiStore";

// Minimal cn utility
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");

export type PanelState = "universe" | "mindmap";

const patternVariants: any = {
  idle: (i: number) => ({
    scale: [1, 1.05, 1],
    rotate: 0,
    transition: {
      scale: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 },
    },
  }),
  hover: (i: number) => ({
    scale: [1, 1.08, 1],
    rotate: 0,
    transition: {
      scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.05 },
    },
  }),
  active: (i: number) => ({
    scale: [1, 0.2, 1.8, 1],
    transition: { duration: 0.8, ease: "circOut", delay: i * 0.02 },
  }),
  pending: (i: number) => ({
    rotate: [0, 360],
    scale: [1, 0.8, 1],
    transition: {
      rotate: { duration: 4, repeat: Infinity, ease: "linear" },
      scale: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 },
    },
  }),
};

const CRYSTAL_DATA = [
  { src: "/svg/crystal-part1.svg", w: 27.98, h: 58.62, mirror: false },
  { src: "/svg/crystal-part2.svg", w: 51.44, h: 82.73, mirror: false },
  { src: "/svg/crystal-part1.svg", w: 27.98, h: 58.62, mirror: true },
  { src: "/svg/crystal-part3.svg", w: 45.75, h: 73.96, mirror: false },
];

const CrystalRing: React.FC<{ color: string; variant: string }> = ({ color: _color, variant }) => (
  <g>
    {Array.from({ length: 24 }).map((_, i) => {
      const angle = i * 15;
      const crystal = CRYSTAL_DATA[i % 4];
      const scaling = 0.4;

      return (
        <g key={i} transform={`translate(100 100) rotate(${angle}) translate(0 -65)`}>
          <motion.g
            custom={i}
            variants={patternVariants}
            initial="idle"
            animate={variant}
          >
            <svg
              x={-crystal.w * scaling / 2}
              y={-crystal.h * scaling / 2 - i % 2 * 5}
              width={crystal.w * scaling}
              height={crystal.h * scaling}
              style={{ transform: crystal.mirror ? "scaleX(-1)" : "none" }}
            >
              <image href={crystal.src} width={crystal.w * scaling} height={crystal.h * scaling} />
            </svg>
          </motion.g>
        </g>
      );
    })}
  </g>
);


const WreathRing: React.FC<{ color: string; variant: string }> = ({ variant }) => (
  <g>
    {Array.from({ length: 6 }).map((_, i) => {
      const angle = i * 60;
      const scaling = 0.78;

      return (
        <g key={i} transform={`translate(100 100) rotate(${angle}) translate(30 55) scale(${scaling})`}>
          <motion.g
            custom={i}
            variants={patternVariants}
            initial="idle"
            animate={variant}
          >
            <image
              href="/svg/wreath-part.svg"
              x={ -97.54 * scaling / 2 }
              y={ -77.94 * scaling / 2 }
              width={ 97.54 * scaling }
              height={ 77.94 * scaling }
              preserveAspectRatio="xMidYMid meet"
            />
          </motion.g>
        </g>
      );
    })}
  </g>
);

const DecorativePatterns: React.FC<{
  isHovered: boolean;
  isPending?: boolean;
  isActivating: boolean;
  color: string;
  type: string;
}> = ({ isHovered, isPending, isActivating, color, type }) => {
  const variant = isPending ? "pending" : isActivating ? "active" : isHovered ? "hover" : "idle";

  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-80"
    >
        {type === "universe" ? (
          <CrystalRing color={color} variant={variant} />
        ) : (
          <WreathRing color={color} variant={variant} />
        )}
    </motion.svg>
  );
};
interface AsymmetricTogglePanelProps {
  currentState: PanelState;
  onStateChange: (state: PanelState) => void;
  onSubmit: () => void;
  isPending?: boolean;
  mindMapProgress?: number;
  isMindMapActive?: boolean;
}

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export const AsymmetricTogglePanel: React.FC<AsymmetricTogglePanelProps> = ({
  currentState,
  onStateChange,
  onSubmit,
  isPending,
  mindMapProgress = 0,
}) => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [hoveredId, setHoveredId] = useState<PanelState | null>(null);
  const [isActivatingId, setIsActivatingId] = useState<PanelState | null>(null);

  const options = [
    {
      id: "mindmap" as const,
      label: "记忆织网",
      description: "收束私密想法，化作记忆晶体",
      icon: Network,
      activeGlow: "shadow-[0_0_30px_rgba(244,114,182,0.5)]",
      activeColor: "text-pink-500 dark:text-pink-400",
      patternColor: "rgba(251, 207, 232, 0.7)",
    },
    {
      id: "universe" as const,
      label: "星海回响",
      description: "向所有人公开，汇入无垠星海",
      icon: Compass,
      activeGlow: "shadow-[0_0_30px_rgba(96,165,250,0.5)]",
      activeColor: "text-blue-500 dark:text-blue-400",
      patternColor: "rgba(191, 219, 254, 0.7)",
    },
  ];

  const springConfig = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 1,
  };

  const handleDragEnd = (_e: any, { offset, velocity }: PanInfo) => {
    const swipe = swipePower(offset.x, velocity.x);
    if (swipe < -swipeConfidenceThreshold) {
      if (currentState === "universe") onStateChange("mindmap");
    } else if (swipe > swipeConfidenceThreshold) {
      if (currentState === "mindmap") onStateChange("universe");
    }
  };

  const handleButtonClick = (optId: PanelState, isActive: boolean) => {
    if (!isActive) {
      onStateChange(optId);
    } else if (!isPending && !isActivatingId) {
      setIsActivatingId(optId);
      setTimeout(() => {
        setIsActivatingId(null);
        onSubmit();
      }, 800);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full items-center">
      {/* Label Header */}
      <div className="flex items-center gap-2 self-start px-2">
        <Send className="w-4 h-4 text-slate-400" />
        <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-black">
          发布路径
        </span>
      </div>

      <motion.div
        className="flex items-center justify-center gap-8 w-full h-[260px] relative"
        drag={reduceMotion ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.05}
        onDragEnd={handleDragEnd}
      >
        {options.map((opt) => {
          const isActive = currentState === opt.id;
          const isHovered = hoveredId === opt.id;

          return (
            <div key={opt.id} className="relative flex items-center justify-center w-48 h-48">
              <motion.button
                layout={!reduceMotion}
                transition={springConfig}
                onClick={() => handleButtonClick(opt.id, isActive)}
                disabled={isPending && isActive}
                onMouseEnter={() => setHoveredId(opt.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  "relative flex flex-col items-center justify-center overflow-hidden transition-all duration-500 outline-none rounded-full border-2",
                  isActive
                    ? `w-44 h-44 z-10 ${opt.activeGlow} border-white/40 dark:border-white/20 scale-110 cursor-pointer`
                    : "w-12 h-12 z-0 border-white/60 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-2xl opacity-60 hover:opacity-100 hover:scale-110 cursor-pointer shadow-lg"
                )}
              >
                {/* SVG Progress Ring for Mindmap */}
                {opt.id === "mindmap" && (
                  <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                    {/* Empty track */}
                    <circle
                      cx="50"
                      cy="50"
                      r="48"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-white/20 dark:text-white/10"
                    />
                    {/* Progress track */}
                    <circle
                      cx="50"
                      cy="50"
                      r="48"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={48 * 2 * Math.PI}
                      strokeDashoffset={48 * 2 * Math.PI * (1 - (mindMapProgress || 0) / 7)}
                      className={cn("transition-all duration-700 ease-in-out", isActive ? "text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]" : "text-pink-400/80 drop-shadow-[0_0_4px_rgba(244,114,182,0.4)]")}
                    />
                  </svg>
                )}

                {/* Image Overlay for text readability - mimic mood strips */}
                {isActive && (
                   <div className="absolute inset-0 bg-black/20 pointer-events-none mix-blend-overlay" />
                )}
                {isActive && (
                   <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60 pointer-events-none" />
                )}

                {/* Custom Decorative Patterns */}
                {isActive && (
                  <DecorativePatterns
                    isHovered={isHovered}
                    isPending={isPending}
                    isActivating={isActivatingId === opt.id}
                    color={opt.patternColor}
                    type={opt.id}
                  />
                )}

                <AnimatePresence mode="wait">
                  {isActive ? (
                    <motion.div
                      key="active-content"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3 }}
                      className="relative z-10 flex flex-col items-center justify-center p-4 text-center gap-1"
                    >
                      <opt.icon className={cn("w-8 h-8 drop-shadow-md", opt.activeColor)} />
                      <span className="font-elysia-display font-bold text-white text-lg tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {opt.label}
                      </span>
                      <p className="text-[10px] font-medium text-white/90 leading-tight max-w-[120px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                        {isPending ? "正在织入..." : opt.description}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="inactive-content"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="relative flex items-center justify-center w-full h-full"
                    >
                      <div
                        className={cn(
                          "transition-[filter,opacity,transform] duration-300 ease-out",
                          isHovered ? "blur-[1.4px] opacity-0 scale-75" : "blur-0 opacity-100 scale-100",
                          "text-slate-600 dark:text-slate-300"
                        )}
                      >
                        <opt.icon className="w-6 h-6" />
                      </div>
                      <span
                        className={cn(
                          "pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-100 transition-all duration-300",
                          isHovered ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-125 blur-sm"
                        )}
                      >
                        {opt.label}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Loading State Overlay */}
                {isPending && isActive && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <opt.icon className={cn("w-10 h-10", opt.activeColor)} />
                    </motion.div>
                  </div>
                )}
              </motion.button>

              {/* Glowing active indicator ring */}
              {isActive && !reduceMotion && (
                <motion.div
                  animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className={cn(
                    "absolute -inset-1 rounded-full border-2 pointer-events-none z-[-1]",
                    opt.id === "universe" ? "border-blue-400/30" : "border-pink-400/30"
                  )}
                />
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};
