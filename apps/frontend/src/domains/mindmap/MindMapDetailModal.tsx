import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRecord, createReply } from "../../lib/apiClient";
import { getEmotionConfig } from "../universe/UniverseCard";
import { cn } from "../../lib/cn";
import { MainInputCard } from "../../components/ui/MainInputCard";
import { MoodStripSelector } from "../../components/ui/MoodStripSelector";
import { Tag as TagIcon } from "lucide-react";

const EmotionSelector: React.FC<{
  extraEmotions: string[];
  onToggle: (tag: string) => void;
}> = ({ extraEmotions, onToggle }) => (
  <div className="flex flex-col gap-3 mt-6 mb-4 px-2">
    <div className="flex items-center gap-2">
      <TagIcon className="w-4 h-4 text-slate-400" />
      <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-black">情绪心境</span>
    </div>
    <MoodStripSelector extraEmotions={extraEmotions} onToggle={onToggle} />
  </div>
);

export const MindMapDetailModal: React.FC<{ recordId: string | null; onClose: () => void }> = ({ recordId, onClose }) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['record', recordId],
    queryFn: () => getRecord(recordId!),
    enabled: !!recordId,
  });

  const [isReplying, setIsReplying] = useState(false);
  const [moodPhrase, setMoodPhrase] = useState("");
  const [quote, setQuote] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [extraEmotions, setExtraEmotions] = useState<string[]>([]);

  const replyMutation = useMutation({
    mutationFn: () => createReply(recordId!, {
      content: moodPhrase,
      moodPhrase: moodPhrase,
      quote: quote || undefined,
      description: description || undefined,
      extraEmotions,
      isPublic,
    }),
    onSuccess: () => {
      setIsReplying(false);
      queryClient.invalidateQueries({ queryKey: ['mindmap'] });
    }
  });

  if (!recordId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onWheel={(e) => e.stopPropagation()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "relative w-full max-w-[800px] max-h-[85vh] flex flex-col md:flex-row gap-0",
            "bg-white/60 dark:bg-slate-900/60 backdrop-blur-3xl saturate-[1.5]",
            "border border-white/40 dark:border-white/10 rounded-[32px]",
            "shadow-[0_20px_60px_rgba(0,0,0,0.1),0_0_40px_rgba(255,255,255,0.2)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4),0_0_40px_rgba(255,182,193,0.05)]",
            "overflow-hidden"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 光晕背景装饰 */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-pink-300/20 dark:bg-pink-900/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none mix-blend-screen" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-300/20 dark:bg-indigo-900/20 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/4 pointer-events-none mix-blend-screen" />

          {isLoading || !data ? (
            <div className="w-full h-64 flex items-center justify-center">
              <div className="font-elysia-poem text-xl text-slate-500/70 dark:text-slate-400/70 animate-pulse">
                正在读取记忆的回响...♪
              </div>
            </div>
          ) : (
            <>
              {/* 左侧：原卡片内容展示 */}
              <div className="flex-1 flex flex-col p-8 overflow-hidden relative z-10 min-w-0">
                {/* 顶部标签和时间 */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8 shrink-0">
                  <div className="flex flex-wrap gap-2">
                    {(data.tags || []).map((tag, idx) => {
                      const config = getEmotionConfig(tag);
                      return (
                        <span 
                          key={idx}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border shadow-sm backdrop-blur-md",
                            config.bgClass,
                            config.textClass,
                            config.borderClass
                          )}
                        >
                          <span className="text-[14px]">{config.icon}</span>
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                  
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap bg-white/40 dark:bg-black/20 px-4 py-1.5 rounded-full border border-white/30 dark:border-white/5">
                    {new Date(data.record.createdAt).toLocaleString('zh-CN', {
                      month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>

                {/* 核心内容区 */}
                <div className="flex flex-col gap-6 flex-1 min-h-0">
                  <div className="shrink-0 flex flex-col gap-6">
                    {/* 标题 */}
                    <h2 className="font-elysia-display text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                      {data.record.moodPhrase}
                    </h2>

                    {/* 金句/誓言 */}
                    {data.quote && (
                      <div className="relative pl-6 py-2 my-2">
                        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-pink-300 to-indigo-300 dark:from-pink-600 dark:to-indigo-600 opacity-60" />
                        <p className="font-elysia-poem text-xl sm:text-2xl text-slate-600 dark:text-slate-300 italic leading-relaxed">
                          "{data.quote}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 长故事/描述 */}
                  {data.record.description && (
                    <div className="mt-4 flex-1 flex flex-col min-h-0">
                      <p className="text-[11px] tracking-[0.2em] text-blue-500/80 dark:text-blue-400/80 font-bold mb-3 uppercase shrink-0">Story</p>
                      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white/30 dark:bg-black/20 p-5 rounded-2xl border border-white/50 dark:border-white/5 shadow-sm">
                        <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                          {data.record.description}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 底部作者区 */}
                <div className="mt-8 pt-6 border-t border-white/20 dark:border-white/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-200 to-indigo-200 dark:from-pink-800 dark:to-indigo-800 border-2 border-white dark:border-slate-700 flex items-center justify-center shadow-md">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {data.author?.displayName?.slice(0, 1) || "?"}
                      </span>
                    </div>
                    <span className="font-elysia-display text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {data.author?.displayName || "未知旅人"}
                    </span>
                  </div>
                  
                  {!isReplying && (
                    <button 
                      onClick={() => setIsReplying(true)}
                      className="px-6 py-2 rounded-full bg-gradient-to-r from-pink-400 to-indigo-400 hover:from-pink-500 hover:to-indigo-500 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
                    >
                      留下评论共鸣 ♪
                    </button>
                  )}
                </div>
              </div>

              {/* 右侧：展开的评论/编辑区 */}
              <AnimatePresence>
                {isReplying && (
                  <motion.div 
                    initial={{ width: 0, opacity: 0, x: 20 }}
                    animate={{ width: 450, opacity: 1, x: 0 }}
                    exit={{ width: 0, opacity: 0, x: 20 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="overflow-hidden border-l border-white/20 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl z-20 flex flex-col shrink-0"
                  >
                    <div className="w-[450px] h-full relative p-6 pt-8 flex flex-col">
                      <div className="flex items-center justify-between mb-6 shrink-0">
                        <h3 className="font-elysia-display text-lg font-bold text-slate-800 dark:text-slate-200">
                          编织新的回响
                        </h3>
                        <button 
                          onClick={() => setIsReplying(false)}
                          className="w-8 h-8 rounded-full bg-white/50 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/40 flex items-center justify-center text-slate-500 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar -mx-6 px-6 pb-20">
                        <MainInputCard
                          moodPhrase={moodPhrase}
                          setMoodPhrase={setMoodPhrase}
                          quote={quote}
                          setQuote={setQuote}
                          description={description}
                          setDescription={setDescription}
                          isPending={replyMutation.isPending}
                        />
                        <EmotionSelector
                          extraEmotions={extraEmotions}
                          onToggle={(tag) =>
                            setExtraEmotions((prev) =>
                              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                            )
                          }
                        />
                      </div>
                      
                      <div className="pt-4 mt-auto border-t border-white/20 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl absolute bottom-0 left-0 right-0 px-6 pb-6">
                        <button
                          onClick={() => setIsPublic(!isPublic)}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-colors border",
                            isPublic 
                              ? "bg-indigo-100/50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300"
                              : "bg-white/50 dark:bg-black/30 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                          )}
                        >
                          <span className="text-[14px]">{isPublic ? "🌍" : "🔒"}</span>
                          {isPublic ? "公开到星海" : "仅自己可见"}
                        </button>
                        
                        <button
                          onClick={() => replyMutation.mutate()}
                          disabled={!moodPhrase.trim() || replyMutation.isPending}
                          className="px-6 py-2 rounded-full bg-gradient-to-r from-pink-400 to-indigo-400 hover:from-pink-500 hover:to-indigo-500 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {replyMutation.isPending ? "正在发送..." : "发送共鸣 ♪"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
