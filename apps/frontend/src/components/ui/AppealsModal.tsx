import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAppealsStatus, submitAppeal } from '../../lib/apiClient';
import { LiquidCard } from './LiquidCard';
import { pickRandomCopy, useRotatingCopy } from '../../lib/rotatingCopy';

const APPEAL_PENDING_MESSAGES = [
  '爱莉会把你的说明认真送去复核，请稍等一下下。',
  '这份申诉已经在路上啦，爱莉不会让它被忽略的♪',
  '别担心，爱莉会把你的这次说明稳稳送到。',
];
const APPEAL_ERROR_MESSAGES = {
  pending: [
    '哎呀，这份申诉已经在处理中啦，我们先等等结果回来，好吗？♪',
  ],
  used: [
    '哎呀，这次机会已经用过了呢，我们先等最后的结果吧。',
  ],
  generic: [
    '哎呀，爱莉刚刚没有听清这份说明，再让我认真看一次，好不好？♪',
    '这份说明刚刚没能顺利递出去，不过别担心，爱莉陪你再试一次。',
  ],
};

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
  const pendingMessage = useRotatingCopy(APPEAL_PENDING_MESSAGES, 10000, Boolean(hasPendingAppeal || success));

  const submitMutation = useMutation({
    mutationFn: () => submitAppeal(activeBanEventId!, appealText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appeals-status'] });
      setError(null);
      setSuccess(true);
    },
    onError: (error: unknown) => {
      const err = error as { code?: string; data?: { message?: string } };
      if (err?.code === 'APPEAL_PENDING') {
        setError(pickRandomCopy(APPEAL_ERROR_MESSAGES.pending));
        return;
      }
      if (err?.code === 'APPEAL_USED') {
        setError(pickRandomCopy(APPEAL_ERROR_MESSAGES.used));
        return;
      }
      setError(pickRandomCopy(APPEAL_ERROR_MESSAGES.generic));
    }
  });

  if (isLoading || !data) return null;
  // If user is not banned, don't show the appeals modal
  if (!isBanned) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-4 bg-white/40 dark:bg-black/60 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="my-auto w-full max-w-lg"
      >
        <LiquidCard className="max-h-[calc(100dvh-2rem)] overflow-hidden p-8 border-red-200/50 dark:border-red-900/30">
          <div className="hide-scrollbar max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1">
            <div className="text-center mb-8">
            <h2 className="font-elysia-display text-3xl text-slate-800 dark:text-slate-200 mb-2">
              账号状态提醒
            </h2>
            <p className="font-elysia-poem text-[1.45rem] leading-none text-slate-500/90 dark:text-slate-300/80">
              如果你愿意，爱莉会认真听你说明。
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              你似乎碰到了星海的边界。<br/>
              如果这是一场误会，请把经过认真告诉爱莉吧。
            </p>
            </div>

            <div className="space-y-4">
              {hasPendingAppeal || success ? (
                <div className="flex flex-col items-center justify-center py-6 text-slate-500 dark:text-slate-400">
                  <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-blue-400 animate-spin mb-4" />
                  <p>申诉正在处理中♪</p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={pendingMessage}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                      className="text-xs mt-2 opacity-70 text-center"
                    >
                      {pendingMessage}
                    </motion.p>
                  </AnimatePresence>
                </div>
              ) : hasUsedAppeal ? (
                <div className="flex flex-col items-center justify-center py-6 text-amber-600 dark:text-amber-500 text-center">
                  <p>这次申诉机会已经用掉了</p>
                  <p className="text-xs mt-2 opacity-70">这件事已经进入最终处理阶段，暂时不能再重复申诉了。</p>
                </div>
              ) : (
                <>
                  <textarea
                    className="w-full bg-white/50 dark:bg-black/20 border border-white/40 dark:border-white/10 rounded-2xl p-4 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300/50 resize-none min-h-[120px]"
                    placeholder="请告诉爱莉，你为什么觉得这次判断有误，或你之后会怎样更好地守护这里。"
                    value={appealText}
                    onChange={(e) => {
                      setAppealText(e.target.value);
                      setError(null);
                    }}
                    disabled={submitMutation.isPending}
                  />
                  <div className="flex items-center justify-between px-1 text-xs text-slate-400 dark:text-slate-300/65">
                    <span>建议 10-500 字，说清楚一点，爱莉会更容易帮你把话带到。</span>
                    <span>{appealText.trim().length} 字</span>
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
                  </AnimatePresence>

                  <div className="flex justify-end pt-4">
                    <button
                      onClick={() => submitMutation.mutate()}
                      disabled={submitMutation.isPending || appealText.trim().length < 10 || appealText.trim().length > 500}
                      className="px-8 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-medium transition-all disabled:opacity-50 shadow-sm"
                    >
                      {submitMutation.isPending ? '正在替你递交申诉♪' : '提交申诉'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </LiquidCard>
      </motion.div>
    </div>
  );
};
