import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CrystalButton } from "./CrystalButton";
import { Send, Compass, Calendar, Network, Star } from "lucide-react";

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
  showSwitch,
  isSwitched,
  onSwitchToggle,
}) => {
  const [isActivated, setIsActivated] = useState(false);

  const handleRightClick = () => {
    if (isRightActive) {
      setIsActivated(true);
      setTimeout(() => setIsActivated(false), 1000);
    }
    onRightClick();
  };

  const icons = {
    "save-universe": { left: <Send className="w-5 h-5" />, right: <Compass className="w-5 h-5" /> },
    "timeline-mindmap": { left: <Calendar className="w-5 h-5" />, right: <Network className="w-5 h-5" /> },
  };

  const currentIcons = icons[type];
  const isToggleMode = (showSwitch || isSwitched !== undefined) && onSwitchToggle !== undefined;
  const fillPercentage = progress !== undefined ? progress * 100 : (isSwitched ? 100 : 0);

  return (
    <div className="flex flex-col items-center gap-3 w-fit group">
      {/* Labels Row */}
      <div className="flex justify-between w-full px-2">
        <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-bold drop-shadow-sm">
          {leftLabel}
        </span>
        <span className="text-[10px] tracking-widest text-blue-500 dark:text-blue-400 uppercase font-bold drop-shadow-sm">
          {rightLabel}
        </span>
      </div>

      <div className="relative flex items-center gap-2 p-2 bg-white/40 dark:bg-black/20 rounded-[2rem] border border-white/60 dark:border-white/10 backdrop-blur-2xl shadow-xl transition-all duration-500 hover:shadow-2xl hover:bg-white/50">

        {/* Left Button */}
        <div className="relative z-10">
          <CrystalButton
            variant="primary"
            size="icon"
            onClick={onLeftClick}
            disabled={isPending}
            className="w-12 h-12 rounded-full shadow-lg border-2 border-white/80 dark:border-white/20 hover:scale-110 active:scale-95 transition-all"
          >
            <div className={`${isPending ? "animate-spin" : "group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"}`}>
              {currentIcons.left}
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
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
            {/* Glowing pulse moving across the link */}
            <motion.div
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent blur-[2px] z-10 pointer-events-none"
            />
          </div>

          {/* Progress Gadget / Switch Thumb */}
          <motion.div
            className="absolute w-6 h-6 bg-white shadow-md rounded-full border border-pink-100 flex items-center justify-center z-20 pointer-events-none group-hover/track:scale-110 transition-transform"
            animate={{
               left: `calc(${fillPercentage}% - 12px)`, // Center the thumb on the edge
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
             <div className="w-2 h-2 rounded-full bg-gradient-to-br from-pink-200 to-blue-300" />
          </motion.div>
        </div>

        {/* Right Button */}
        <div className="relative z-10">
          <CrystalButton
            variant={isRightActive ? "primary" : "ghost"}
            size="icon"
            onClick={handleRightClick}
            className={`w-12 h-12 rounded-full transition-all duration-500 border-2 ${
              isRightActive
              ? "shadow-[0_0_20px_rgba(96,165,250,0.4)] border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/20 scale-110"
              : "opacity-40 grayscale hover:opacity-100 hover:grayscale-0 border-white/40"
            }`}
          >
            <div className={`${isRightActive ? "text-blue-500 animate-pulse" : "text-slate-400"}`}>
              {currentIcons.right}
            </div>
          </CrystalButton>

          {/* Special Activation Animation */}
          <AnimatePresence>
            {isActivated && (
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
            {isActivated && (
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
        <span className="text-[9px] font-bold tracking-tighter text-slate-400 uppercase bg-white/50 dark:bg-black/30 px-2 py-0.5 rounded-full border border-white/40">
          {rightActiveLabel}
        </span>
      )}
    </div>
  );
};
