import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAppealsStatus, submitAppeal } from '../../lib/apiClient';
import { LiquidCard } from './LiquidCard';

export const AppealsModal: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['appeals-status'],
    queryFn: getAppealsStatus,
    retry: false,
  });

  const [appealText, setAppealText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // We need the active ban event id. Let's assume it's returned in the status response
  const activeBanEventId = data?.activeBanEvent?.id;
  const hasPendingAppeal = data?.pendingAppeal !== undefined;
  const hasUsedAppeal = data?.activeBanEvent?.appealUsed === true;
  const isBanned = data?.isBanned === true;

  const submitMutation = useMutation({
    mutationFn: () => submitAppeal(activeBanEventId!, appealText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appeals-status'] });
      setError(null);
      setSuccess(true);
    },
    onError: (error: unknown) => {
      const err = error as { data?: { message?: string } };
      setError(err?.data?.message || '提交失败，请检查是否已提交过申诉');
    }
  });

  if (isLoading || !data) return null;
  // If user is not banned, don't show the appeals modal
  if (!isBanned) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-white/40 dark:bg-black/60 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <LiquidCard className="p-8 border-red-200/50 dark:border-red-900/30">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-serif text-slate-800 dark:text-slate-200 mb-2">
              账号受限通知
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              你似乎触碰到了星海的边界。<br/>
              如果这是一场误会，请告诉我们。
            </p>
          </div>

          <div className="space-y-4">
            {hasPendingAppeal || success ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-500 dark:text-slate-400">
                <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-blue-400 animate-spin mb-4" />
                <p>申诉正在处理中</p>
                <p className="text-xs mt-2 opacity-70">每次限制仅有一次申诉机会，请耐心等待。</p>
              </div>
            ) : hasUsedAppeal ? (
               <div className="flex flex-col items-center justify-center py-6 text-amber-600 dark:text-amber-500 text-center">
                <p>该事件的申诉机会已使用</p>
                <p className="text-xs mt-2 opacity-70">守护者已做出最终裁决，该账号将被永久封停。</p>
              </div>
            ) : (
              <>
                <textarea
                  className="w-full bg-white/50 dark:bg-black/20 border border-white/40 dark:border-white/10 rounded-2xl p-4 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300/50 resize-none min-h-[120px]"
                  placeholder="请说明你认为这是误判的原因，或表达你愿意遵守规则的意愿..."
                  value={appealText}
                  onChange={(e) => {
                    setAppealText(e.target.value);
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
                </AnimatePresence>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending || appealText.trim().length < 10}
                    className="px-8 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-medium transition-all disabled:opacity-50 shadow-sm"
                  >
                    {submitMutation.isPending ? '提交中...' : '提交申诉'}
                  </button>
                </div>
              </>
            )}
          </div>
        </LiquidCard>
      </motion.div>
    </div>
  );
};
