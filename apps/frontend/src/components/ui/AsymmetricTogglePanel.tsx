import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUiStore } from "../../store/uiStore";

// Minimal cn utility
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");

export type PanelState = "universe" | "mindmap";

interface AsymmetricTogglePanelProps {
  currentState: PanelState;
  onStateChange: (state: PanelState) => void;
  onSubmit: () => void;
  isPending?: boolean;
  canSend?: boolean;
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

export const AsymmetricTogglePanel: React.FC<AsymmetricTogglePanelProps> = ({
  currentState,
  onStateChange,
  onSubmit,
  isPending,
  canSend = true,
}) => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [hoveredStates, setHoveredStates] = useState<Record<PanelState, boolean>>({
    mindmap: false,
    universe: false,
  });

  const options = [
    {
      id: "mindmap" as const,
      label: "编入织网",
      description: "编入织网珍藏",
      iconSrc: "/svg/wreath-icon.svg",
      activeBg: canSend ? "bg-white/10 dark:bg-black/20" : "bg-white/5 dark:bg-black/10",
      activeText: canSend ? "text-[#FFA6C9]" : "text-slate-400 opacity-60",
      hoverBg: "hover:bg-white/20 dark:hover:bg-black/40",
      glowBg: "from-[#FFA6C9]/0 via-[#FFA6C9]/20 to-[#FFA6C9]/0",
    },
    {
      id: "universe" as const,
      label: "送入星海",
      description: "汇入星海众愿",
      iconSrc: "/svg/crystal-icon.svg",
      activeBg: canSend ? "bg-white/10 dark:bg-black/20" : "bg-white/5 dark:bg-black/10",
      activeText: canSend ? "text-blue-400" : "text-slate-400 opacity-60",
      hoverBg: "hover:bg-white/20 dark:hover:bg-black/40",
      glowBg: "from-blue-400/0 via-blue-400/20 to-blue-400/0",
    },
  ];

  const springConfig = {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
    mass: 1,
  };

  const handleButtonClick = (optId: PanelState, isActive: boolean) => {
    if (!isActive) {
      onStateChange(optId);
    } else if (!isPending && canSend) {
      onSubmit();
    }
  };

  return (
    <div
      className="flex justify-end p-1.5 backdrop-blur-md bg-white/20 dark:bg-black/30 border border-white/30 dark:border-white/10 rounded-full shadow-lg relative items-center"
    >

      <div className="flex gap-1 z-10 relative">
        {options.map((opt) => {
          const isActive = currentState === opt.id;

          return (
            <motion.button
              key={opt.id}
              layout={!reduceMotion}
              transition={springConfig}
              whileHover={reduceMotion ? undefined : (isActive && canSend ? { scale: 1.02 } : (!isActive && canSend ? { scale: 1.05 } : {}))}
              onHoverStart={() => setHoveredStates(prev => ({ ...prev, [opt.id]: true }))}
              onHoverEnd={() => setHoveredStates(prev => ({ ...prev, [opt.id]: false }))}
              onClick={() => handleButtonClick(opt.id, isActive)}
              disabled={isPending || (isActive && !canSend)}
              title={opt.description}
              className={cn(
                "group relative flex items-center justify-center transition-colors outline-none rounded-full shrink-0 h-12",
                isActive
                  ? `px-6 ${opt.activeBg} border ${canSend ? 'border-white/20' : 'border-white/5'} shadow-inner overflow-hidden cursor-pointer disabled:cursor-not-allowed`
                  : `w-12 ${opt.hoverBg} cursor-pointer text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-transparent hover:border-white/10 overflow-visible`
              )}
            >
              {/* Dynamic flow effect on the background of the active button */}
              {isActive && canSend && !reduceMotion ? (
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                <motion.div
                  className="w-full h-full z-0"
                  animate={{
                    backgroundPosition: ["200% 50%", "0% 50%"],
                  }}
                  transition={{
                    duration: isPending ? 1 : 3.2,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                  style={{
                    backgroundSize: "200% 100%",
                    backgroundImage: `linear-gradient(90deg, transparent, ${currentState === 'mindmap' ? (isPending ? 'rgba(255,166,201,0.4)' : 'rgba(255,166,201,0.1)') : (isPending ? 'rgba(96,165,250,0.4)' : 'rgba(96,165,250,0.1)')}, transparent)`,
                  }}
                />
              </div>
              ): null}

              <AnimatePresence mode="popLayout" initial={false}>
                {isActive ? (
                  <motion.div
                    key="active-content"
                    layout={!reduceMotion}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={springConfig}
                    className={cn("flex flex-nowrap items-center whitespace-nowrap gap-2", opt.activeText)}
                  >
                    <IconGlyph src={opt.iconSrc} sizeClass="w-5 h-5 shrink-0" />
                    <span className="text-base font-medium tracking-wide pr-1">
                      {opt.label}
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="inactive-content"
                    layout={!reduceMotion}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={springConfig}
                    className="relative w-full h-full flex items-center justify-center"
                  >
                    <div
                      className={`flex items-center justify-center w-full h-full transition-all duration-300 ${
                          hoveredStates[opt.id] ? "blur-[1.4px] opacity-70 scale-95" : "blur-0 opacity-100 scale-100"
                        }`}
                    >
                      <IconGlyph src={opt.iconSrc} sizeClass="w-5 h-5" />
                    </div>
                    <span
                      className={`pointer-events-none absolute inset-0 flex items-center p-3 justify-center text-[10px] font-semibold min-w-[2em] text-center leading-tight whitespace-normal text-slate-700 dark:text-slate-100 transition-opacity duration-300 ${
                        hoveredStates[opt.id] ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Glowing active indicator line */}
              {isActive && !reduceMotion && !isPending && canSend && (
                 <motion.div
                   className="absolute bottom-0 left-1/4 right-1/4 h-[2.5px] bg-gradient-to-r"
                   style={{
                     backgroundImage: `linear-gradient(to right, transparent, ${currentState === 'mindmap' ? '#FFA6C9' : '#60A5FA'}, transparent)`
                   }}
                   animate={{ opacity: [0.5, 1, 0.5] }}
                   transition={{ duration: hoveredStates[opt.id] ? 1 : 1.6, repeat: Infinity, ease: "easeInOut" }}
                 />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
