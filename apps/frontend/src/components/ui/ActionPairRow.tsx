import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CrystalButton } from "./CrystalButton";
import { Star } from "lucide-react";

interface ActionPairRowProps {
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
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const ActionPairRow: React.FC<ActionPairRowProps> = ({
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
  leftIcon = <Star className="w-4 h-4" />,
  rightIcon = <Star className="w-4 h-4" />,
}) => {
  const [isPumping, setIsPumping] = useState(false);

  const handleRightClick = () => {
    setIsPumping(true);
    onRightClick();
    setTimeout(() => setIsPumping(false), 600);
  };

  // Color logic based on state
  const getLinkColor = () => {
    if (progress !== undefined) {
       return "bg-gradient-to-r from-pink-400 to-blue-400";
    }
    return isSwitched 
      ? "bg-gradient-to-r from-blue-300 to-blue-500" 
      : "bg-slate-200 dark:bg-white/10";
  };

  return (
    <div className="flex flex-col items-end gap-1 group">
      {rightActiveLabel && (
        <span className="text-[10px] tracking-widest text-slate-400 uppercase font-medium mr-2">
          {rightActiveLabel}
        </span>
      )}
      
      <div className="relative flex items-center gap-3 px-1.5 py-1 bg-white/30 dark:bg-black/10 rounded-full border border-white/50 dark:border-white/5 backdrop-blur-md">
        
        {/* Liquid Glass Link */}
        <div className={`absolute inset-x-10 top-1/2 -translate-y-1/2 h-1 rounded-full transition-all duration-500 ${getLinkColor()}`}>
          {/* Progress Gadget / Switch Thumb */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-slate-200 dark:border-white/20 rounded-full shadow-md z-20"
            animate={{ 
              left: progress !== undefined ? `${progress * 100}%` : (isSwitched ? "100%" : "0%"),
              x: progress !== undefined ? "-50%" : (isSwitched ? "-100%" : "0%")
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
          
          {/* Glowing pulse */}
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 w-1/2 h-full bg-white/40 blur-[2px]"
          />
        </div>

        {/* Left Button */}
        <div className="relative z-10 flex flex-col items-center">
          <CrystalButton
            variant="primary"
            size="icon"
            onClick={onLeftClick}
            disabled={isPending}
            className="w-8 h-8 rounded-full shadow-sm"
          >
            <div className={isPending ? "animate-spin" : ""}>{leftIcon}</div>
          </CrystalButton>
          <span className="absolute -bottom-5 whitespace-nowrap text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity font-elysia-display">{leftLabel}</span>
        </div>

        {/* Spacer for the link */}
        <div className="w-12 h-8" />

        {/* Right Button */}
        <div className="relative z-10 flex flex-col items-center">
          <CrystalButton
            variant={isRightActive ? "primary" : "ghost"}
            size="icon"
            onClick={handleRightClick}
            className={`w-8 h-8 rounded-full transition-all ${isRightActive ? "shadow-sm scale-105" : "opacity-40 grayscale"}`}
          >
            <div className={isRightActive ? "text-blue-400" : ""}>{rightIcon}</div>
          </CrystalButton>
          <span className="absolute -bottom-5 whitespace-nowrap text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity font-elysia-display">{rightLabel}</span>
        </div>

        {/* Pumping Star */}
        <AnimatePresence>
          {isPumping && isRightActive && (
            <motion.div
              initial={{ x: -100, opacity: 1, scale: 1 }}
              animate={{ x: 0, scale: [1, 1.5, 1], opacity: [1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
            >
              <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showSwitch && onSwitchToggle && (
        <div className="hidden">
           {/* Legacy toggle hidden, functionality moved to gadget/link click if needed */}
        </div>
      )}
    </div>
  );
};
