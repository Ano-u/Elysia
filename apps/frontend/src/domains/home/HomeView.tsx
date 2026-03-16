import React from "react";
import { motion } from "framer-motion";
import { LiquidCard } from "../../components/ui/LiquidCard";
import { ProgressiveInput } from "../../components/ui/ProgressiveInput";
import { useUiStore } from "../../store/uiStore";
import { getTransition } from "../../lib/animations";

export const HomeView: React.FC = () => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8 relative w-full overflow-hidden z-10 pb-[env(safe-area-inset-bottom)]">
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{
          ...getTransition(reduceMotion),
          duration: reduceMotion ? 0.3 : 1.2,
          delay: 0.1,
        }}
        className="w-full max-w-2xl flex flex-col items-center relative z-20"
      >
        {/* 顶部极简品牌/提示区域 */}
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mb-8 sm:mb-12 relative flex flex-col items-center text-center"
        >
          <div className="absolute -inset-8 bg-gradient-to-br from-[var(--elysia-mist)] to-[var(--elysia-coral)] blur-3xl opacity-30 rounded-full mix-blend-multiply dark:mix-blend-overlay pointer-events-none"></div>
          <h1
            className="text-4xl sm:text-5xl font-light tracking-wide text-transparent bg-clip-text bg-gradient-to-br from-slate-700 to-slate-400 dark:from-slate-200 dark:to-slate-500 relative z-10 font-serif mb-4"
            style={{ textShadow: "0 4px 20px rgba(255,255,255,0.2)" }}
          >
            Elysia
          </h1>
          <p className="text-slate-500 dark:text-slate-400/80 text-sm font-medium tracking-widest uppercase relative z-10">
            捕捉流动的思绪
          </p>
        </motion.div>

        {/* 核心输入区包裹在液态玻璃卡片中 */}
        <LiquidCard className="w-full relative z-30 p-6 sm:p-12 overflow-visible min-h-[40vh] bg-white/40 dark:bg-black/20">
          <ProgressiveInput />
        </LiquidCard>
      </motion.div>
    </div>
  );
};
