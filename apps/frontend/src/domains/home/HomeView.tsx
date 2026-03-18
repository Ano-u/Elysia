import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LiquidCard } from "../../components/ui/LiquidCard";
import { ProgressiveInput } from "../../components/ui/ProgressiveInput";
import { useUiStore } from "../../store/uiStore";
import { getTransition } from "../../lib/animations";
import {
  completeOnboardingDay,
  getHomeFeed,
  getOnboardingProgress,
  updateRecordVisibility,
} from "../../lib/apiClient";
import type { PublicationStatus, RecordSummary } from "../../types/api";

const BRIDGE_BG_URL =
  "https://img2-tc.tapimg.com/moment/etag/FpPUtSEl5fZvpOCCmhFVlWDqIFXr.png/_tap_ugc.jpg";
const ONBOARDING_STORAGE_KEY = "elysia-warm-guide-v1";

const STATUS_LABEL: Record<PublicationStatus, string> = {
  private: "仅自己可见",
  pending_auto: "待自动审核",
  pending_manual: "待审核",
  pending_second_review: "二次审查",
  risk_control_24h: "风控24h",
  published: "已公开",
  rejected: "驳回",
  needs_changes: "驳回待修改",
};

const PETAL_POSITIONS = [
  { left: "6%", top: "22%", delay: 0.1, scale: 0.8 },
  { left: "18%", top: "12%", delay: 0.6, scale: 1.1 },
  { left: "31%", top: "28%", delay: 1.4, scale: 0.9 },
  { left: "52%", top: "16%", delay: 1.9, scale: 1.2 },
  { left: "64%", top: "24%", delay: 2.4, scale: 0.85 },
  { left: "77%", top: "11%", delay: 2.9, scale: 0.95 },
  { left: "88%", top: "27%", delay: 3.4, scale: 1.05 },
];

function formatRelativeTime(isoTime: string): string {
  const diffMs = new Date(isoTime).getTime() - Date.now();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const rtf = new Intl.RelativeTimeFormat("zh", { numeric: "auto" });

  if (Math.abs(diffMs) < hourMs) {
    return rtf.format(Math.round(diffMs / minuteMs), "minute");
  }
  if (Math.abs(diffMs) < dayMs) {
    return rtf.format(Math.round(diffMs / hourMs), "hour");
  }
  return rtf.format(Math.round(diffMs / dayMs), "day");
}

const FloatingPetals: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => (
  <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
    {PETAL_POSITIONS.map((petal, index) => (
      <motion.span
        key={index}
        initial={{ opacity: 0, y: 12 }}
        animate={
          reduceMotion
            ? { opacity: 0.45, y: 0 }
            : {
                opacity: [0.28, 0.56, 0.3],
                y: [0, 24, 0],
                x: [0, index % 2 === 0 ? 14 : -12, 0],
                rotate: [0, index % 2 === 0 ? 11 : -13, 0],
              }
        }
        transition={
          reduceMotion
            ? { duration: 0.3, delay: petal.delay }
            : {
                duration: 11 + (index % 3) * 2,
                delay: petal.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
        className="absolute h-3.5 w-3.5 rounded-[60%_40%_65%_35%] bg-gradient-to-br from-[#fff8fb] via-[#ffd9ea] to-[#ffc7e0] blur-[0.3px]"
        style={{
          left: petal.left,
          top: petal.top,
          scale: petal.scale,
          boxShadow: "0 0 12px rgba(255, 208, 228, 0.46)",
        }}
      />
    ))}
  </div>
);

const OnboardingTaskCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: getOnboardingProgress,
  });

  const completeMutation = useMutation({
    mutationFn: (day: number) => completeOnboardingDay(day),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-progress"] });
    },
  });

  const currentDay = Math.min(data?.progress.current_day ?? 1, 7);
  const todayTask = data?.tasks.find((task) => task.day === currentDay) ?? null;
  const completedDays = data?.progress.completed_days ?? [];
  const completionRate = Math.min((completedDays.length / 7) * 100, 100);
  const todayCompleted = todayTask ? completedDays.includes(todayTask.day) : false;

  return (
    <LiquidCard className="p-5 sm:p-6 bg-white/40 dark:bg-black/18">
      <p className="text-xs tracking-[0.16em] text-slate-400 dark:text-slate-300/60">Warm Path · 7 Days</p>
      <h3 className="mt-2 font-elysia-display text-2xl text-slate-700 dark:text-slate-100">今日 1 分钟任务</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-300/82">
        {isLoading
          ? "正在准备今日任务..."
          : todayTask
          ? `Day ${todayTask.day}: ${todayTask.title}`
          : "今天先写一句，礼堂会记住你正在努力的这一刻。"}
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/70 dark:bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${completionRate}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="h-full rounded-full bg-gradient-to-r from-[#ffd2e7] via-[#f8e7ff] to-[#d6e9ff]"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400 dark:text-slate-300/65">
          已完成 {completedDays.length}/7 天
        </span>
        <button
          type="button"
          disabled={!todayTask || todayCompleted || completeMutation.isPending}
          onClick={() => {
            if (!todayTask) {
              return;
            }
            completeMutation.mutate(todayTask.day);
          }}
          className="rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
        >
          {todayCompleted ? "今日已点亮" : completeMutation.isPending ? "点亮中..." : "完成今日任务"}
        </button>
      </div>
    </LiquidCard>
  );
};

const HomeTimeline: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["home-feed"],
    queryFn: () => getHomeFeed(12),
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      updateRecordVisibility(id, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      queryClient.invalidateQueries({ queryKey: ["universe"] });
    },
  });

  const renderRow = (item: RecordSummary) => {
    const statusLabel = STATUS_LABEL[item.publicationStatus];
    const visibilityLabel = item.visibilityIntent === "public" ? "公开意向" : "私密意向";

    return (
      <div
        key={item.id}
        className="rounded-2xl border border-white/45 bg-white/50 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/20"
      >
        <p className="font-elysia-display text-base text-slate-700 dark:text-slate-100">{item.moodPhrase}</p>
        {item.description && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300/85 line-clamp-2">{item.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100/80 px-2.5 py-1 text-slate-500 dark:bg-slate-800/80 dark:text-slate-200">
            {statusLabel}
          </span>
          <span className="rounded-full bg-pink-50/80 px-2.5 py-1 text-pink-600 dark:bg-pink-900/20 dark:text-pink-300">
            {visibilityLabel}
          </span>
          <span className="text-slate-400 dark:text-slate-400">{formatRelativeTime(item.createdAt)}</span>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() =>
              visibilityMutation.mutate({
                id: item.id,
                isPublic: item.visibilityIntent !== "public",
              })
            }
            disabled={visibilityMutation.isPending}
            className="rounded-full border border-white/65 bg-white/85 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
          >
            {item.visibilityIntent === "public" ? "改为私密" : "改为公开"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <LiquidCard className="h-full min-h-[44vh] p-5 sm:p-6 bg-white/38 dark:bg-black/18">
      <div className="mb-4 flex items-end justify-between">
        <h3 className="font-elysia-display text-2xl text-slate-700 dark:text-slate-100">无瑕石庭·最近记录</h3>
        <span className="text-xs text-slate-500 dark:text-slate-300/75">私密内容也会在这里出现</span>
      </div>
      <div className="hide-scrollbar max-h-[38vh] space-y-3 overflow-y-auto pr-1 sm:max-h-[46vh]">
        {isLoading && <p className="text-sm text-slate-400">正在捧起你最近的心情片段...</p>}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-300/80">还没有记录，先写一句就能点亮这片星海。</p>
        )}
        {data?.items.map(renderRow)}
      </div>
    </LiquidCard>
  );
};

const WarmGuideOverlay: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "像花朵一样开始",
      description: "你不必一次写完。先写一句，就已经是对今天最温柔也最勇敢的拥抱。",
    },
    {
      title: "粉色天空下的礼堂",
      description: "空间站负责记录，星海漫游负责共鸣，记忆之网会帮你看见情绪与命运之间的连结。",
    },
    {
      title: "誓言与希望会被看见",
      description: "公开内容会先审核，私密内容只你可见。遇到误判时，我们也会坚定地为你保留申诉入口。",
    },
  ];

  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-white/45 p-4 backdrop-blur-xl dark:bg-black/55"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="w-full max-w-xl rounded-3xl border border-white/50 bg-white/70 p-6 shadow-[var(--shadow-crystal)] dark:border-white/10 dark:bg-slate-900/70"
          >
            <p className="text-xs tracking-[0.16em] text-slate-400">Warm Guide {step + 1}/3</p>
            <h3 className="font-elysia-display mt-2 text-3xl text-slate-700 dark:text-slate-100">
              {steps[step].title}
            </h3>
            <p className="font-elysia-poem mt-3 text-2xl leading-relaxed text-slate-500 dark:text-slate-300/85 sm:text-[2rem]">
              {steps[step].description}
            </p>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-300/80 dark:hover:text-slate-100"
                onClick={onClose}
              >
                稍后再看
              </button>
              <div className="flex gap-2">
                {!isLast && (
                  <button
                    type="button"
                    className="rounded-full border border-white/60 bg-white/75 px-4 py-2 text-sm text-slate-600 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
                    onClick={() => setStep((value) => Math.min(value + 1, steps.length - 1))}
                  >
                    下一步
                  </button>
                )}
                {isLast && (
                  <button
                    type="button"
                    className="rounded-full bg-slate-900 px-5 py-2 text-sm text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    onClick={onClose}
                  >
                    我想开始
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const HomeView: React.FC = () => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
  });

  const closeGuide = () => {
    setShowGuide(false);
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "seen");
  };

  const replayGuide = () => {
    setShowGuide(true);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-20 sm:px-8">
      <motion.div
        aria-hidden
        className="absolute inset-0 z-0"
        animate={
          reduceMotion
            ? undefined
            : {
                scale: [1.02, 1.06, 1.02],
                x: [0, -16, 0],
                y: [0, 12, 0],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                duration: 24,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
        style={{
          backgroundImage: `url(${BRIDGE_BG_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.95) brightness(1.08)",
        }}
      />

      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-white/45 via-white/72 to-white/86 dark:from-slate-900/35 dark:via-slate-900/68 dark:to-slate-900/84" />
      <div className="absolute inset-0 z-[2] pointer-events-none bg-[radial-gradient(circle_at_20%_14%,rgba(255,255,255,0.7),transparent_45%),radial-gradient(circle_at_82%_12%,rgba(255,231,242,0.52),transparent_38%),radial-gradient(circle_at_50%_90%,rgba(214,236,255,0.34),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-x-[9%] top-[7%] z-[3] h-[53%] rounded-[44%_44%_8%_8%/58%_58%_8%_8%] border border-white/45 bg-gradient-to-b from-white/26 to-transparent dark:border-white/10 dark:from-white/5" />
      <div className="pointer-events-none absolute inset-x-[16%] top-[12%] z-[3] h-[43%] rounded-[42%_42%_8%_8%/56%_56%_8%_8%] border border-white/35 dark:border-white/8" />
      <div className="pointer-events-none absolute inset-x-0 top-[52%] z-[3] h-[1px] bg-gradient-to-r from-transparent via-white/65 to-transparent dark:via-white/18" />

      <FloatingPetals reduceMotion={reduceMotion} />

      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{
          ...getTransition(reduceMotion),
          duration: reduceMotion ? 0.3 : 0.92,
          delay: 0.08,
        }}
        className="relative z-20 w-full max-w-6xl"
      >
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.22 }}
          className="mb-7 text-center sm:mb-10"
        >
          <h1 className="font-elysia-logo text-[4.6rem] font-medium tracking-[0.03em] text-transparent bg-gradient-to-b from-[#fffefd] via-[#fff4fb] to-[#eaf0ff] bg-clip-text drop-shadow-[0_6px_18px_rgba(245,236,250,0.92)] sm:text-[5.4rem]">
            Elysia
          </h1>
          <p className="mt-3 font-elysia-display text-lg text-slate-600/88 dark:text-slate-200/90">
            粉色天空坠入无瑕石庭，愿你在誓言与希望里安心书写。
          </p>
          <p className="font-elysia-poem mt-2 text-[1.6rem] leading-none text-slate-500/85 dark:text-slate-200/82 sm:text-[1.9rem]">
            真诚地爱着世界，也真诚地爱着你自己。
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-300/75">
            慢慢来，先写一句就很好。你不是独自一人，我们会一直温柔又热情地接住你。
          </p>
          <button
            type="button"
            onClick={replayGuide}
            className="mt-2 rounded-full border border-white/60 bg-white/65 px-3 py-1 text-xs text-slate-500 transition-colors hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
          >
            回看引导
          </button>
        </motion.div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr] lg:gap-6">
          <LiquidCard className="min-h-[46vh] p-6 sm:p-10 bg-white/45 dark:bg-black/23">
            <ProgressiveInput />
          </LiquidCard>
          <div className="space-y-4">
            <OnboardingTaskCard />
            <HomeTimeline />
          </div>
        </div>
      </motion.div>
      <WarmGuideOverlay open={showGuide} onClose={closeGuide} />
    </div>
  );
};
