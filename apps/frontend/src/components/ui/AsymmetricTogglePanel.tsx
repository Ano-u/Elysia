import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PanInfo } from "framer-motion";
import { Send } from "lucide-react";
import { useUiStore } from "../../store/uiStore";

// Minimal cn utility
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");

export type PanelState = "universe" | "mindmap";

const patternVariants: any = {
  idle: (i: number) => ({
    scale: [1, 1.12, 1],
    rotate: 0,
    transition: {
      scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.08 },
    },
  }),
  hover: () => ({
    scale: [1, 1.04, 1],
    rotate: 0,
    transition: {
      scale: { duration: 1.3, repeat: Infinity, ease: "easeInOut", delay: 0 },
    },
  }),
  pending: (i: number) => ({
    rotate: [0, 360],
    scale: [1, 0.92, 1],
    transition: {
      rotate: { duration: 2.8, repeat: Infinity, ease: "linear" },
      scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 },
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
  color: string;
  type: string;
}> = ({ isHovered, isPending, color, type }) => {
  const variant = isPending ? "pending" : isHovered ? "hover" : "idle";

  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-80"
      style={{ color }}
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

const IconGlyph: React.FC<{ src: string; sizeClass: string; className?: string }> = ({ src, sizeClass, className }) => (
  <span
    aria-hidden="true"
    className={cn("inline-block bg-current", sizeClass, className)}
    style={{
      WebkitMaskImage: `url(${src})`,
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      WebkitMaskSize: "contain",
      maskImage: `url(${src})`,
      maskRepeat: "no-repeat",
      maskPosition: "center",
      maskSize: "contain",
    }}
  />
);

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

  const options = [
    {
      id: "mindmap" as const,
      label: "记忆织网",
      description: "收束私密想法，化作记忆晶体",
      iconSrc: "/svg/wreath-icon.svg",
      activeGlow: "shadow-[0_0_24px_rgba(255,166,201,0.45)]",
      iconColor: "text-[#FFA6C9]",
      patternColor: "#FFA6C9",
      ringBorderColor: "border-[#FFA6C9]/40",
      ringTrackColor: "text-white/25",
      ringProgressGlow: "drop-shadow-[0_0_8px_rgba(255,166,201,0.8)]",
    },
    {
      id: "universe" as const,
      label: "星海回响",
      description: "向所有人公开，汇入无垠星海",
      iconSrc: "/svg/crystal-icon.svg",
      activeGlow: "shadow-[0_0_24px_rgba(96,165,250,0.45)]",
      iconColor: "text-blue-400",
      patternColor: "#60A5FA",
      ringBorderColor: "border-blue-400/35",
      ringTrackColor: "text-white/25",
      ringProgressGlow: "drop-shadow-[0_0_8px_rgba(96,165,250,0.75)]",
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
    } else if (!isPending) {
      onSubmit();
    }
  };

  const getProgressRatio = (optionId: PanelState) => {
    if (optionId !== "mindmap") return 1;
    return Math.max(0, Math.min(1, (mindMapProgress || 0) / 7));
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
          const progressRatio = getProgressRatio(opt.id);
          const ringRadius = 47;
          const ringLength = 2 * Math.PI * ringRadius;
          const ringSizeClass = isActive ? "w-[12rem] h-[12rem]" : "w-[4.25rem] h-[4.25rem]";
          const shouldShowProgress = opt.id === "mindmap";
          const showIdleBreath = isActive && !isPending && !isHovered;

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
                  "relative flex flex-col items-center justify-center overflow-hidden transition-all duration-500 outline-none rounded-full",
                  isActive
                    ? `w-44 h-44 z-10 ${opt.activeGlow} scale-110 cursor-pointer bg-white/60 dark:bg-black/35 border-2 border-white/40 dark:border-white/20 backdrop-blur-xl shadow-[var(--shadow-crystal)]`
                    : "w-12 h-12 z-0 border-2 border-transparent bg-white/40 dark:bg-black/20 backdrop-blur-sm opacity-60 hover:opacity-100 hover:scale-110 cursor-pointer shadow-[var(--shadow-crystal)] hover:bg-black/5 dark:hover:bg-white/10 hover:border-white/40"
                )}
              >

                {/* Custom Decorative Patterns */}
                {isActive && (
                  <DecorativePatterns
                    isHovered={isHovered}
                    isPending={isPending}
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
                      <motion.div
                        animate={
                          showIdleBreath
                            ? { scale: [1, 1.1, 1], opacity: [0.85, 1, 0.85] }
                            : { scale: 1, opacity: 1 }
                        }
                        transition={{ duration: 2.1, repeat: showIdleBreath ? Infinity : 0, ease: "easeInOut" }}
                        className={cn(showIdleBreath && opt.ringProgressGlow)}
                      >
                        <IconGlyph src={opt.iconSrc} sizeClass="w-10 h-10" className={cn("drop-shadow-md", opt.iconColor)} />
                      </motion.div>
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
                          isHovered ? "blur-[1.4px] opacity-70 scale-95" : "blur-0 opacity-100 scale-100",
                          opt.iconColor
                        )}
                      >
                        <IconGlyph src={opt.iconSrc} sizeClass="w-6 h-6" />
                      </div>
                      <span
                        className={cn(
                          "pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold transition-all duration-300",
                          opt.iconColor,
                          isHovered ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-110 blur-sm"
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
                      <IconGlyph src={opt.iconSrc} sizeClass="w-10 h-10" className={opt.iconColor} />
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
                    "absolute -inset-1 rounded-full border-2 pointer-events-none z-10",
                    opt.ringBorderColor
                  )}
                />
              )}

              {shouldShowProgress && (
                <svg
                  className={cn(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 -rotate-90",
                    ringSizeClass,
                  )}
                  viewBox="0 0 120 120"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isActive ? 2.8 : 2.4}
                    className={opt.ringTrackColor}
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke={opt.patternColor}
                    strokeWidth={isActive ? 2.8 : 2.4}
                    strokeLinecap="round"
                    strokeDasharray={ringLength}
                    strokeDashoffset={ringLength * (1 - progressRatio)}
                    className={cn("transition-all duration-700 ease-in-out", opt.ringProgressGlow)}
                  />
                </svg>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};
