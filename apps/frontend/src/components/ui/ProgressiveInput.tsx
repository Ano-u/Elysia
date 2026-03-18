import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const ProgressiveInput: React.FC = () => {
  const [value, setValue] = useState('');
  
  return (
    <div className="w-full relative">
      <textarea
        className="w-full bg-transparent border-none outline-none resize-none text-xl sm:text-2xl font-light placeholder:text-slate-400/50 dark:placeholder:text-slate-500/50 min-h-[120px] focus:ring-0 p-0"
        placeholder="在这里留下你的思绪..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <AnimatePresence>
        {value.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex justify-end mt-4"
          >
            <button className="px-6 py-2 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium text-sm transition-transform hover:scale-105 active:scale-95">
              记录
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
