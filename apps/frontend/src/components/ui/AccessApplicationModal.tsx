import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessApplicationStatus, submitAccessApplication } from '../../lib/apiClient';
import { LiquidCard } from './LiquidCard';

export const AccessApplicationModal: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['access-application-status'],
    queryFn: getAccessApplicationStatus,
    retry: false,
  });

  const [essay, setEssay] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: () => submitAccessApplication(essay),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-application-status'] });
      setError(null);
    },
    onError: (error: unknown) => {
      const err = error as { data?: { message?: string } };
      setError(err?.data?.message || '提交失败，请稍后再试');
    }
  });

  // Only show if we know the user needs to apply (not_submitted or pending or rejected)
  // If undefined or approved, we render nothing
  if (isLoading || !data) return null;
  if (data.accessStatus === 'approved') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-white/40 dark:bg-black/40 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-lg"
      >
        <LiquidCard className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-serif text-slate-800 dark:text-slate-200 mb-2">
              初次见面
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              为了守护这片星海的纯净，我们希望能稍微了解你一点。<br/>
              告诉我们你为什么想加入，或者想在这里记录些什么？
            </p>
          </div>

          {data.accessStatus === 'pending' ? (
             <div className="flex flex-col items-center justify-center py-8 text-slate-500 dark:text-slate-400">
               <div className="w-12 h-12 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-pink-300 dark:border-t-pink-400 animate-spin mb-4" />
               <p>你的心意已寄出</p>
               <p className="text-xs mt-2 opacity-70">请耐心等待星海的回应...</p>
             </div>
          ) : (
            <div className="space-y-4">
              <textarea
                className="w-full bg-white/50 dark:bg-black/20 border border-white/40 dark:border-white/10 rounded-2xl p-4 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-300/50 resize-none min-h-[120px]"
                placeholder="比如：想找一个安静的地方记录生活中的小确幸..."
                value={essay}
                onChange={(e) => {
                  setEssay(e.target.value);
                  setError(null);
                }}
                disabled={submitMutation.isPending}
              />

              <AnimatePresence>
                {error && (
                   <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     exit={{ opacity: 0, height: 0 }}
                     className="text-amber-500 text-sm px-2"
                   >
                     {error}
                   </motion.div>
                )}

                {data.accessStatus === 'rejected' && data.application?.reviewNote && !error && (
                   <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     exit={{ opacity: 0, height: 0 }}
                     className="bg-amber-50/50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-sm p-3 rounded-xl border border-amber-200/50 dark:border-amber-800/50"
                   >
                     <p className="font-medium mb-1">守护者的回信：</p>
                     <p className="opacity-90">{data.application.reviewNote}</p>
                   </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || essay.trim().length < 10}
                  className="px-8 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-medium transition-all disabled:opacity-50 shadow-sm"
                >
                  {submitMutation.isPending ? '递送中...' : '寄出心意'}
                </button>
              </div>
            </div>
          )}
        </LiquidCard>
      </motion.div>
    </div>
  );
};
