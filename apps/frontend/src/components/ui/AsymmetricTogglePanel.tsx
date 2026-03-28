import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useUiStore } from "../../store/uiStore";

// Minimal cn utility
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");

export type PanelState = "universe" | "mindmap";

interface AsymmetricTogglePanelProps {
  currentState: PanelState;
  onStateChange: (state: PanelState) => void;
  onSubmit: () => void;
  isPending?: boolean;
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
}) => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [isHovered, setIsHovered] = useState(false);

  const options = [
    {
      id: "mindmap" as const,
      label: "记忆织网",
      description: "编入织网珍藏",
      iconSrc: "/svg/wreath-icon.svg",
      activeBg: "bg-white/10 dark:bg-black/20",
      activeText: "text-[#FFA6C9]",
      hoverBg: "hover:bg-white/20 dark:hover:bg-black/40",
      glowBg: "from-[#FFA6C9]/0 via-[#FFA6C9]/20 to-[#FFA6C9]/0",
    },
    {
      id: "universe" as const,
      label: "星海回响",
      description: "汇入星海众愿",
      iconSrc: "/svg/crystal-icon.svg",
      activeBg: "bg-white/10 dark:bg-black/20",
      activeText: "text-blue-400",
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
    } else if (!isPending) {
      onSubmit();
    }
  };

  return (
    <div
      className="flex justify-end p-1.5 backdrop-blur-md bg-white/20 dark:bg-black/30 border border-white/30 dark:border-white/10 rounded-full shadow-lg relative items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Dynamic flow effect on the background of the active button */}
      <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
        <motion.div
          className="w-full h-full z-0"
          animate={{
            backgroundPosition: ["0% 50%", "200% 50%"],
          }}
          transition={{
            duration: isHovered ? 3 : 0.5,
            ease: "linear",
            repeat: Infinity,
          }}
          style={{
            backgroundSize: "200% 100%",
            backgroundImage: `linear-gradient(90deg, transparent, ${currentState === 'mindmap' ? 'rgba(255,166,201,0.1)' : 'rgba(96,165,250,0.1)'}, transparent)`,
          }}
        />
      </div>

      <div className="flex gap-1 z-10 relative">
        {options.map((opt) => {
          const isActive = currentState === opt.id;

          return (
            <motion.button
              key={opt.id}
              layout={!reduceMotion}
              transition={springConfig}
              onClick={() => handleButtonClick(opt.id, isActive)}
              disabled={isPending}
              title={opt.description}
              className={cn(
                "group relative flex items-center justify-center transition-colors outline-none rounded-full shrink-0 h-12",
                isActive
                  ? `px-6 ${opt.activeBg} border border-white/20 shadow-inner overflow-hidden`
                  : `w-12 ${opt.hoverBg} cursor-pointer text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-transparent hover:border-white/10 overflow-visible`
              )}
            >
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
                    {isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                    ) : (
                      <>
                        <IconGlyph src={opt.iconSrc} sizeClass="w-5 h-5 shrink-0" />
                        <span className="text-base font-medium tracking-wide pr-1">
                          {opt.label}
                        </span>
                      </>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="inactive-content"
                    layout={!reduceMotion}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={springConfig}
                    className="flex items-center justify-center w-full h-full"
                  >
                    <IconGlyph src={opt.iconSrc} sizeClass="w-5 h-5" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Glowing active indicator line */}
              {isActive && !reduceMotion && !isPending && (
                 <motion.div
                   className="absolute bottom-0 left-1/4 right-1/4 h-[1.5px] bg-gradient-to-r"
                   style={{
                     backgroundImage: `linear-gradient(to right, transparent, ${currentState === 'mindmap' ? '#FFA6C9' : '#60A5FA'}, transparent)`
                   }}
                   animate={{ opacity: [0.5, 1, 0.5] }}
                   transition={{ duration: isHovered ? 1 : 2, repeat: Infinity, ease: "easeInOut" }}
                 />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
