import React from "react";
import { motion } from "framer-motion";
import { useUiStore } from "../../store/uiStore";

export const MindMapView: React.FC = () => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8 relative w-full overflow-hidden z-10">
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h2 className="text-3xl font-light text-slate-800 dark:text-slate-200 mb-4">
          记忆之网
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          概念地图正在构建中...
        </p>
      </motion.div>
    </div>
  );
};
