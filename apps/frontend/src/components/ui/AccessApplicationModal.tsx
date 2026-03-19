import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessApplicationStatus, getAuthMe, submitAccessApplication } from '../../lib/apiClient';
import { LiquidCard } from './LiquidCard';

export const AccessApplicationModal: React.FC = () => {
  const queryClient = useQueryClient();
  const authQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: getAuthMe,
    retry: false,
  });
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
      setError(err?.data?.message || '心意递送失败，请稍后再试');
    }
  });

  // Only show if we know the user needs to apply (not_submitted or pending or rejected)
  // If undefined or approved, we render nothing
  if (authQuery.data?.user?.role === 'admin') return null;
  if (isLoading || !data) return null;
  if (data.accessStatus === 'approved') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 bg-white/40 dark:bg-black/40 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="my-auto w-full max-w-lg"
      >
        <LiquidCard className="max-h-[calc(100dvh-2rem)] overflow-hidden p-8">
          <div className="hide-scrollbar max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1">
            <div className="text-center mb-8">
            <h2 className="font-elysia-display text-3xl text-slate-800 dark:text-slate-200 mb-2">
              欢迎来到 Elysia
            </h2>
            <p className="font-elysia-poem text-[1.45rem] leading-none text-slate-500/90 dark:text-slate-300/80">
              真诚的心意，会被认真听见。
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              为了守护星海的纯净，也为了更温柔地迎接你，我们想先认识你一点。<br/>
              告诉我们你为什么想加入，或想在这里守护怎样的心情。
            </p>
            </div>

            {data.accessStatus === 'pending' ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500 dark:text-slate-400">
                <div className="w-12 h-12 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-pink-300 dark:border-t-pink-400 animate-spin mb-4" />
                <p>你的心意已寄出</p>
                <p className="text-xs mt-2 opacity-70">请耐心等待，我们会认真读完你的每一句话。</p>
              </div>
            ) : (
              <div className="space-y-4">
                <textarea
                  className="w-full bg-white/50 dark:bg-black/20 border border-white/40 dark:border-white/10 rounded-2xl p-4 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-300/50 resize-none min-h-[120px]"
                  placeholder="比如：我想在这里温柔地记录生活，也想把热烈与希望留下来。"
                  value={essay}
                  onChange={(e) => {
                    setEssay(e.target.value);
                    setError(null);
                  }}
                  disabled={submitMutation.isPending}
                />
                <div className="flex items-center justify-between px-1 text-xs text-slate-400 dark:text-slate-300/65">
                  <span>建议 10-300 字，写真实的你就好。</span>
                  <span>{essay.trim().length} 字</span>
                </div>

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
                      <p className="font-medium mb-1">守护者回信：</p>
                      <p className="opacity-90">{data.application.reviewNote}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending || essay.trim().length < 10 || essay.trim().length > 300}
                    className="px-8 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-medium transition-all disabled:opacity-50 shadow-sm"
                  >
                    {submitMutation.isPending ? '递送中...' : '寄出心意'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </LiquidCard>
      </motion.div>
    </div>
  );
};
