import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CrystalButton } from "./CrystalButton";
import { Send, Compass, Calendar, Network, Star } from "lucide-react";
import { useUiStore } from "../../store/uiStore";

interface ActionPairRowProps {
  type: "save-universe" | "timeline-mindmap";
  leftLabel: string;
  rightLabel: string;
  onLeftClick: () => void;
  onRightClick: () => void;
  isRightActive: boolean;
  rightActiveLabel?: string;
  progress?: number; // 0 to 1
  isPending?: boolean;
  leftActionEvent?: { token: number; status: "success" | "error" } | null;
  showSwitch?: boolean;
  isSwitched?: boolean;
  onSwitchToggle?: (value: boolean) => void;
}

export const ActionPairRow: React.FC<ActionPairRowProps> = ({
  type,
  leftLabel,
  rightLabel,
  onLeftClick,
  onRightClick,
  isRightActive,
  rightActiveLabel,
  progress,
  isPending,
  leftActionEvent,
  showSwitch,
  isSwitched,
  onSwitchToggle,
}) => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [isActivated, setIsActivated] = useState(false);
  const [leftSendAnimation, setLeftSendAnimation] = useState<"idle" | "success" | "error">("idle");
  const [hoveredIcon, setHoveredIcon] = useState<"left" | "right" | null>(null);
  const [clickedIconLock, setClickedIconLock] = useState<"left" | "right" | null>(null);
  const [isDesktopHoverMode, setIsDesktopHoverMode] = useState(false);
  const isSaveUniverse = type === "save-universe";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
    const updateHoverMode = () => {
      const canUseHover = mediaQuery.matches;
      setIsDesktopHoverMode(canUseHover);

      if (!canUseHover) {
        setHoveredIcon(null);
        setClickedIconLock(null);
      }
    };

    updateHoverMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateHoverMode);
      return () => mediaQuery.removeEventListener("change", updateHoverMode);
    }

    mediaQuery.addListener(updateHoverMode);
    return () => mediaQuery.removeListener(updateHoverMode);
  }, []);

  useEffect(() => {
    if (!isSaveUniverse || !leftActionEvent) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeftSendAnimation(leftActionEvent.status);
    const resetDelay = leftActionEvent.status === "success" ? 1150 : 520;
    const timer = setTimeout(() => {
      setLeftSendAnimation("idle");
    }, resetDelay);

    return () => clearTimeout(timer);
  }, [isSaveUniverse, leftActionEvent]);

  const showLabelOnHover = isDesktopHoverMode;

  const handleIconMouseEnter = (side: "left" | "right") => {
    if (!showLabelOnHover || clickedIconLock === side) return;
    setHoveredIcon(side);
  };

  const handleIconMouseLeave = (side: "left" | "right") => {
    if (hoveredIcon === side) setHoveredIcon(null);
    if (clickedIconLock === side) setClickedIconLock(null);
  };

  const hideHoverTextImmediately = (side: "left" | "right") => {
    if (!showLabelOnHover) return;
    setHoveredIcon((current) => (current === side ? null : current));
    setClickedIconLock(side);
  };

  const isIconLabelVisible = (side: "left" | "right") =>
    showLabelOnHover && hoveredIcon === side && clickedIconLock !== side;

  const handleRightClick = () => {
    hideHoverTextImmediately("right");
    if (isRightActive) {
      setIsActivated(true);
      setTimeout(() => setIsActivated(false), 1000);
    }
    onRightClick();
  };

  const handleLeftClick = () => {
    hideHoverTextImmediately("left");
    onLeftClick();
  };

  const icons = {
    "save-universe": { left: <Send className="w-5 h-5" />, right: <Compass className="w-5 h-5" /> },
    "timeline-mindmap": { left: <Calendar className="w-5 h-5" />, right: <Network className="w-5 h-5" /> },
  };

  const currentIcons = icons[type];
  const isToggleMode = (showSwitch || isSwitched !== undefined) && onSwitchToggle !== undefined;
  const fillPercentage = progress !== undefined ? progress * 100 : (isSwitched ? 100 : 0);
  const showPendingOrbit = isSaveUniverse && Boolean(isPending) && leftSendAnimation === "idle";
  const leftIconToneClass =
    leftSendAnimation === "success" ? "text-emerald-500" : leftSendAnimation === "error" ? "text-rose-500" : "text-slate-600 dark:text-slate-300";
  const leftIconMotion =
    leftSendAnimation === "success"
      ? {
          x: reduceMotion ? 0 : [0, 22, 22, -16, 0],
          y: reduceMotion ? 0 : [0, -22, -22, 16, 0],
          opacity: reduceMotion ? [1, 0, 1] : [1, 1, 0, 0, 1],
          rotate: reduceMotion ? 0 : [0, -12, -12, 8, 0],
          transition: { duration: 1.05, times: reduceMotion ? [0, 0.5, 1] : [0, 0.32, 0.42, 0.62, 1], ease: "easeInOut" as const },
        }
      : leftSendAnimation === "error"
        ? {
            x: reduceMotion ? 0 : [0, -4, 4, -3, 3, 0],
            y: 0,
            opacity: 1,
            rotate: reduceMotion ? 0 : [0, -12, 12, -8, 8, 0],
            transition: { duration: 0.45, ease: "easeInOut" as const },
          }
        : {
            x: 0,
            y: 0,
            opacity: 1,
            rotate: 0,
            transition: { duration: 0.2, ease: "easeOut" as const },
          };

  return (
    <div className="flex flex-col items-center gap-3 w-fit group">
      {/* Labels Row */}
      {!isDesktopHoverMode && (
        <div className="flex justify-between w-full px-2">
          <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-bold drop-shadow-sm">
            {leftLabel}
          </span>
          <span className="text-[10px] tracking-widest text-blue-500 dark:text-blue-400 uppercase font-bold drop-shadow-sm">
            {rightLabel}
          </span>
        </div>
      )}

      <div className="relative flex items-center gap-1 p-2 bg-white/40 dark:bg-black/40 rounded-[2rem] border border-white/60 dark:border-white/10 backdrop-blur-2xl shadow-xl transition-all duration-500 hover:shadow-2xl hover:bg-white/50 dark:hover:bg-black/50">

        {/* Left Button */}
        <div className="relative z-10">
          <AnimatePresence>
            {showPendingOrbit ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="pointer-events-none absolute -inset-[3px] rounded-full"
              >
                <motion.div
                  animate={{ rotate: reduceMotion ? 0 : 360 }}
                  transition={{ duration: 1.05, ease: "linear", repeat: Infinity }}
                  className="h-full w-full rounded-full bg-[conic-gradient(from_0deg,rgba(236,72,153,0)_0deg,rgba(236,72,153,0)_250deg,rgba(244,114,182,0.22)_300deg,rgba(244,114,182,0.72)_334deg,rgba(168,85,247,1)_360deg)]"
                  style={{
                    WebkitMask:
                      "radial-gradient(farthest-side, transparent calc(100% - 2.4px), #000 calc(100% - 2.4px))",
                    mask: "radial-gradient(farthest-side, transparent calc(100% - 2.4px), #000 calc(100% - 2.4px))",
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <CrystalButton
            variant="primary"
            size="icon"
            onMouseEnter={() => handleIconMouseEnter("left")}
            onMouseLeave={() => handleIconMouseLeave("left")}
            onClick={handleLeftClick}
            disabled={isPending}
            className="w-12 h-12 rounded-full shadow-lg border-2 border-white/80 dark:border-white/20 hover:scale-110 active:scale-95 transition-all"
          >
            <div className="relative flex items-center justify-center">
              <motion.div
                animate={leftIconMotion}
                className={leftIconToneClass}
              >
                <div
                  className={`transition-[filter,opacity,transform] duration-300 ease-out ${
                    isIconLabelVisible("left") ? "blur-[1.4px] opacity-75 scale-95" : "blur-0 opacity-100 scale-100"
                  }`}
                >
                  {currentIcons.left}
                </div>
              </motion.div>
              <span
                className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700 dark:text-slate-100 transition-opacity duration-300 ${
                  isIconLabelVisible("left") ? "opacity-100" : "opacity-0"
                }`}
              >
                {leftLabel}
              </span>
            </div>
          </CrystalButton>
        </div>

        {/* Liquid Glass Link (Track) */}
        <div
          className={`relative w-12 h-6 mx-2 flex items-center select-none group/track ${isToggleMode ? "cursor-pointer" : "cursor-default"}`}
          onClick={() => isToggleMode && onSwitchToggle?.(!isSwitched)}
        >
          {/* Track Background */}
          <div className="absolute inset-0 rounded-full transition-all duration-500 overflow-hidden shadow-inner bg-black/5 dark:bg-white/5 border border-white/40 dark:border-white/10">
            {/* Liquid Fill */}
            <motion.div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-pink-300 via-purple-300 to-blue-400 opacity-80"
              animate={{ width: `${fillPercentage}%` }}
              transition={{ type: "spring", stiffness: reduceMotion ? 1000 : 100, damping: reduceMotion ? 40 : 20 }}
            />
            {/* Glowing pulse moving across the link */}
            {!reduceMotion && (
              <motion.div
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent blur-[2px] z-10 pointer-events-none"
              />
            )}
          </div>

          {/* Progress Gadget / Switch Thumb */}
          <motion.div
            className={`absolute w-6 h-6 bg-white shadow-md rounded-full border border-pink-100 flex items-center justify-center z-20 pointer-events-none ${isToggleMode && !reduceMotion ? "group-hover/track:scale-110" : ""} transition-transform`}
            animate={{
               left: `calc(${fillPercentage}% - 6px - (${fillPercentage} / 100 * 12px))`, // Center the thumb on the edge
            }}
            transition={{ type: "spring", stiffness: reduceMotion ? 1000 : 300, damping: reduceMotion ? 40 : 30 }}
          >
             <div className="w-2 h-2 rounded-full bg-gradient-to-br from-pink-200 to-blue-300" />
          </motion.div>
        </div>

        {/* Right Button */}
        <div className="relative z-10">
          <CrystalButton
            variant={isRightActive ? "primary" : "ghost"}
            size="icon"
            onMouseEnter={() => handleIconMouseEnter("right")}
            onMouseLeave={() => handleIconMouseLeave("right")}
            onClick={handleRightClick}
            className={`w-12 h-12 rounded-full transition-all duration-500 border-2 ${
              isRightActive
              ? "shadow-[0_0_20px_rgba(96,165,250,0.4)] border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/20 scale-110"
              : "opacity-40 grayscale hover:opacity-100 hover:grayscale-0 border-white/40"
            }`}
          >
            <div className="relative flex items-center justify-center">
              <div
                className={`${isRightActive ? `text-blue-500${reduceMotion ? "" : " animate-pulse"}` : "text-slate-400"} transition-[filter,opacity,transform] duration-300 ease-out ${
                  isIconLabelVisible("right") ? "blur-[1.4px] opacity-70 scale-95" : "blur-0 opacity-100 scale-100"
                }`}
              >
                {currentIcons.right}
              </div>
              <span
                className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold ${
                  isRightActive ? "text-blue-700 dark:text-blue-100" : "text-slate-600 dark:text-slate-200"
                } transition-opacity duration-300 ${
                  isIconLabelVisible("right") ? "opacity-100" : "opacity-0"
                }`}
              >
                {rightLabel}
              </span>
            </div>
          </CrystalButton>

          {/* Special Activation Animation */}
          <AnimatePresence>
            {isActivated && !reduceMotion && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [1, 2, 2.5], opacity: [1, 0.8, 0] }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[-1] pointer-events-none"
              >
                <div className={`w-full h-full rounded-full blur-md ${type === "save-universe" ? "bg-blue-400" : "bg-pink-400"}`} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isActivated && !reduceMotion && (
              <motion.div
                initial={{ x: -120, opacity: 1, scale: 0.8 }}
                animate={{ x: 0, scale: [1, 1.8, 1], opacity: [1, 1, 0] }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
              >
                <Star className={`w-8 h-8 ${type === "save-universe" ? "text-blue-300 fill-blue-300" : "text-pink-300 fill-pink-300"} drop-shadow-glow`} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {rightActiveLabel && (
        <span className="text-[9px] font-bold tracking-tighter text-slate-400 uppercase bg-white/50 dark:bg-black/40 px-2 py-0.5 rounded-full border border-white/40 dark:border-white/10">
          {rightActiveLabel}
        </span>
      )}
    </div>
  );
};
