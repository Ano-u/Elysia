import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRecord } from '../../lib/apiClient';
import type { VisibilityIntent } from '../../types/api';

export const ProgressiveInput: React.FC = () => {
  const [moodPhrase, setMoodPhrase] = useState('');
  const [visibilityIntent, setVisibilityIntent] = useState<VisibilityIntent>('private');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => createRecord({ moodPhrase, visibilityIntent }),
    onSuccess: () => {
      setMoodPhrase('');
      setErrorMsg(null);
      // Invalidate universe or feed queries here
      queryClient.invalidateQueries({ queryKey: ['universe'] });
      // Show success toast or gentle transition
    },
    onError: (error: unknown) => {
      const err = error as { data?: { message?: string } };
      setErrorMsg(err?.data?.message || '记录时遇到了一点小问题，要再试一次吗？');
    }
  });

  const handleRecord = () => {
    if (!moodPhrase.trim()) return;
    createMutation.mutate();
  };

  // Prevent losing unsaved changes gently
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (moodPhrase.trim().length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [moodPhrase]);

  return (
    <div className="w-full relative flex flex-col h-full">
      <textarea
        className="w-full bg-transparent border-none outline-none resize-none text-xl sm:text-2xl font-light placeholder:text-slate-400/50 dark:placeholder:text-slate-500/50 flex-grow min-h-[160px] focus:ring-0 p-0 text-slate-800 dark:text-slate-200"
        placeholder="写下一句此刻的感受..."
        value={moodPhrase}
        onChange={(e) => {
          setMoodPhrase(e.target.value);
          if (errorMsg) setErrorMsg(null);
        }}
        disabled={createMutation.isPending}
      />

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-amber-500/90 dark:text-amber-400/90 text-sm mt-2 font-medium"
          >
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {moodPhrase.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-col sm:flex-row justify-between items-end sm:items-center mt-6 gap-4 border-t border-slate-200/20 dark:border-slate-700/20 pt-4"
          >
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-500 dark:text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 focus:ring-slate-500/30 w-4 h-4"
                  checked={visibilityIntent === 'public'}
                  onChange={(e) => setVisibilityIntent(e.target.checked ? 'public' : 'private')}
                  disabled={createMutation.isPending}
                />
                <span>允许公开共鸣</span>
              </label>
            </div>

            <button
              onClick={handleRecord}
              disabled={createMutation.isPending || !moodPhrase.trim()}
              className="px-6 py-2.5 rounded-full bg-slate-900/90 hover:bg-slate-900 dark:bg-slate-100/90 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-medium text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-sm"
            >
              {createMutation.isPending ? '记录中...' : '留下痕迹'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
