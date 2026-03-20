import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LiquidCard } from "../../components/ui/LiquidCard";
import { MainInputCard } from "../../components/ui/MainInputCard";
import { ActionPairRow } from "../../components/ui/ActionPairRow";
import {
  createRecord,
  getHomeFeed,
  getOnboardingProgress,
  updateRecordVisibility,
} from "../../lib/apiClient";
import type { RecordSummary, VisibilityIntent, CreateRecordRequest, HomeFeedResponse } from "../../types/api";
import { Globe, Lock, Clock } from "lucide-react";
import { pickRandomCopy, useRotatingCopy } from "../../lib/rotatingCopy";
import { getCreateSuccessMessage, getPublicationStatusMeta, type PublicationTone } from "../../lib/publicationCopy";

const DRAFT_KEY = "elysia-home-draft-v3";
const FEED_LOADING_MESSAGES = [
  "爱莉正在把你最近的心情，轻轻捧起来呢♪",
  "请稍等一下下，爱莉在替你整理刚刚落下的星光。",
  "这些心情片段马上就来，爱莉没有忘记它们哦♪",
];
const FEED_EMPTY_MESSAGES = [
  "爱莉希雅听得懂，这里很安静，正适合让心情轻轻开口。",
  "往世乐土还安静着呢，写下一句，就会有光落进来♪",
  "今天想先说哪一句呢？爱莉会认真把它珍藏起来。",
];
const CREATE_RECORD_ERROR_MESSAGES = {
  unauthorized: [
    "哎呀，爱莉刚刚没有听清你的心意，等登录稳稳回来，我们再试一次吧♪",
    "哎呀，这一声心跳刚刚没能顺利落下来，等会儿再让爱莉认真听一遍，好吗？",
  ],
  accessBlocked: [
    "哎呀，你的名字还在往世乐土门前等候呢，等审核通过后，爱莉再认真听你说♪",
    "现在还在准入审核里呢，爱莉已经记下你的心意了，再等等好吗？",
  ],
  riskControl: [
    "哎呀，这一步先被轻轻拦住啦，等风声安静一点，爱莉再陪你继续。",
    "现在还在冷却里呢，爱莉不想你被急急地推着走，我们稍后再来♪",
  ],
  network: [
    "哎呀，网络刚刚晃了一下，不过这份心情没有丢，爱莉陪你再试一次吧♪",
    "刚才那阵风太急了，爱莉没能听清，我们再慢一点说一次好吗？",
  ],
  generic: [
    "哎呀，爱莉刚刚没有听清，再让我认真听一次，好不好？♪",
    "这一句刚刚没能稳稳落下来，不过别担心，爱莉还在这里。",
  ],
};

function resolveCreateErrorMessage(error: unknown): string {
  const maybeErr = error as {
    status?: number;
    code?: string;
    message?: string;
    data?: { message?: string };
  };
  const fallbackMessage = maybeErr.message?.trim().toLowerCase() ?? "";

  if (maybeErr.status === 401) {
    return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.unauthorized);
  }
  if (maybeErr.code === "ACCESS_GATE_BLOCKED") {
    return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.accessBlocked);
  }
  if (maybeErr.code === "RISK_CONTROL_ACTIVE") {
    return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.riskControl);
  }
  if (fallbackMessage.includes("failed to fetch")) {
    return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.network);
  }
  return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.generic);
}

function getStatusBadgeClasses(tone: PublicationTone): string {
  switch (tone) {
    case "private":
      return "border-pink-200/70 bg-pink-50/80 text-pink-600 dark:border-pink-400/20 dark:bg-pink-400/10 dark:text-pink-200";
    case "pending":
      return "border-sky-200/80 bg-sky-50/80 text-sky-600 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200";
    case "review":
      return "border-violet-200/80 bg-violet-50/80 text-violet-600 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200";
    case "caution":
      return "border-amber-200/80 bg-amber-50/85 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200";
    case "published":
      return "border-emerald-200/80 bg-emerald-50/85 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200";
    case "revise":
      return "border-rose-200/80 bg-rose-50/85 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200";
    default:
      return "border-slate-200/80 bg-white/80 text-slate-600 dark:border-white/15 dark:bg-white/10 dark:text-slate-200";
  }
}

interface HomeViewProps {
  onNavigate: (view: "home" | "universe" | "mindmap" | "admin") => void;
}

type DraftPayload = {
  moodPhrase: string;
  quote: string;
  description: string;
  extraEmotions: string[];
  occurredAt: string;
  visibilityIntent: VisibilityIntent;
};

function readInitialDraft(): DraftPayload {
  const emptyDraft: DraftPayload = {
    moodPhrase: "",
    quote: "",
    description: "",
    extraEmotions: [],
    occurredAt: "",
    visibilityIntent: "private",
  };
  if (typeof window === "undefined") return emptyDraft;
  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) return emptyDraft;
  try {
    const parsed = JSON.parse(raw);
    return { ...emptyDraft, ...parsed };
  } catch {
    return emptyDraft;
  }
}

const TEST_DATA: RecordSummary[] = [
  {
    id: "test-1",
    moodPhrase: "在这个春天的午后，我想起了一些往事。",
    quote: "时间是唯一的解药，也是唯一的毒药。",
    extraEmotions: ["想念", "平静"],
    description: "这是第一条测试数据，设置为公开可见。\n点击右侧图标可以切换状态。",
    visibilityIntent: "public",
    publicationStatus: "published",
    isPublic: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "test-2",
    moodPhrase: "深夜的星空总是让人感到自己的渺小。",
    quote: "我们都是星尘，最终也将回归星辰。",
    extraEmotions: ["孤独", "希望"],
    description: "这是第二条测试数据，设置为私密。仅在往世乐土中可见。\n更多描述内容示例。",
    visibilityIntent: "private",
    publicationStatus: "private",
    isPublic: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  }
];

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftPayload>(readInitialDraft);
  const [showOnlyPublic, setShowOnlyPublic] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");

  const { data: feedData, isLoading: isFeedLoading } = useQuery({
    queryKey: ["home-feed"],
    queryFn: () => getHomeFeed(20),
  });

  const { data: onboardingData } = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: getOnboardingProgress,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateRecordRequest) => createRecord(payload),
    onSuccess: (response) => {
      setDraft({ ...draft, moodPhrase: "", quote: "", description: "", extraEmotions: [] });
      localStorage.removeItem(DRAFT_KEY);
      setFeedbackTone("success");
      setFeedbackMessage(getCreateSuccessMessage(response.publishStatus.status));
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      queryClient.invalidateQueries({ queryKey: ["universe"] });
    },
    onError: (error) => {
      setFeedbackTone("error");
      setFeedbackMessage(resolveCreateErrorMessage(error));
    },
  });

  const handleSave = () => {
    if (!draft.moodPhrase.trim()) return;
    createMutation.mutate({
      moodPhrase: draft.moodPhrase.trim(),
      quote: draft.quote.trim() || undefined,
      description: draft.description.trim() || undefined,
      extraEmotions: draft.extraEmotions.length ? draft.extraEmotions : undefined,
      isPublic: draft.visibilityIntent === "public",
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 1500);
    return () => clearTimeout(timer);
  }, [draft]);

  const mindMapProgress = onboardingData ? onboardingData.progress.completed_days.length : 0;
  const isMindMapActive = mindMapProgress >= 7;
  const loadingMessage = useRotatingCopy(FEED_LOADING_MESSAGES, 10000, isFeedLoading);

  const allItems = [...TEST_DATA, ...(feedData?.items ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredItems = allItems.filter(item =>
    !showOnlyPublic || item.visibilityIntent === "public"
  );
  const emptyMessage = useRotatingCopy(
    FEED_EMPTY_MESSAGES,
    10000,
    !isFeedLoading && filteredItems.length === 0,
  );

  return (
    <div className="relative h-full w-full overflow-y-auto hide-scrollbar bg-[#f8fbff] dark:bg-[#0d1422] transition-all duration-700">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.05, 1], x: [0, -10, 0], y: [0, 5, 0] }}
          transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <video
            src="/Timeless-Grand-Hall.webm"
            poster="/Timeless-Grand-Hall.png"
            autoPlay muted loop playsInline
            className="w-full h-full object-cover opacity-60 dark:opacity-20 mix-blend-screen dark:mix-blend-lighten"
          />
        </motion.div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(255,255,255,0.7),transparent_45%),radial-gradient(circle_at_82%_12%,rgba(255,231,242,0.52),transparent_38%),radial-gradient(circle_at_50%_90%,rgba(214,236,255,0.3),transparent_50%)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-6xl mx-auto px-4 pt-16 pb-32 gap-16">
        {/* Section 1: Landing Header & Input */}
        <section className="w-full flex flex-col items-center gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="font-elysia-title elysia-dream-title text-[4rem] sm:text-[5.4rem] tracking-tight">
              Elysia
            </h1>
            <p className="mt-2 font-elysia-display text-base sm:text-lg text-slate-500 dark:text-slate-300">
              粉色天光落进往世乐土，Elysia会永远回应你的期待♪
            </p>
          </motion.div>

          <MainInputCard
            moodPhrase={draft.moodPhrase}
            setMoodPhrase={(v) => {
              setDraft({ ...draft, moodPhrase: v });
              setFeedbackMessage(null);
            }}
            quote={draft.quote}
            setQuote={(v) => {
              setDraft({ ...draft, quote: v });
              setFeedbackMessage(null);
            }}
            description={draft.description}
            setDescription={(v) => {
              setDraft({ ...draft, description: v });
              setFeedbackMessage(null);
            }}
            extraEmotions={draft.extraEmotions}
            setExtraEmotions={(v) => {
              setDraft({ ...draft, extraEmotions: v });
              setFeedbackMessage(null);
            }}
            isPublic={draft.visibilityIntent === "public"}
            onPublicToggle={(isP) => {
              setDraft({ ...draft, visibilityIntent: isP ? "public" : "private" });
              setFeedbackMessage(null);
            }}
            onSave={handleSave}
            onJumpUniverse={() => onNavigate("universe")}
            isPending={createMutation.isPending}
            feedbackMessage={feedbackMessage}
            feedbackTone={feedbackTone}
          />
        </section>

        {/* Section 2: HomeTimeline */}
        <section className="w-full flex flex-col gap-10 relative max-w-4xl">
          {/* Vertical Guide Line */}
          <div className="absolute left-[-2.5rem] top-0 bottom-0 w-[2px] bg-gradient-to-b from-slate-200 via-slate-300 to-transparent dark:from-white/5 dark:via-white/10 hidden lg:block" />

          <div className="flex items-center justify-between px-6">
            <h2 className="font-elysia-title elysia-dream-title text-[2.9rem] sm:text-[3.4rem] tracking-tight">往世乐土</h2>

            <ActionPairRow
              type="timeline-mindmap"
              leftLabel="视图切换"
              rightLabel="记忆织网"
              onLeftClick={() => setShowOnlyPublic(!showOnlyPublic)}
              onRightClick={() => onNavigate("mindmap")}
              isRightActive={isMindMapActive}
              rightActiveLabel={isMindMapActive ? "织网已就绪" : `激活进度 ${mindMapProgress}/7`}
              progress={mindMapProgress}
            />
          </div>

          <div className="grid grid-cols-1 gap-10 px-6">
            {isFeedLoading ? (
              <AnimatePresence mode="wait">
                <motion.p
                  key={loadingMessage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  className="text-center text-slate-400 py-20 font-elysia-display text-xl"
                >
                  {loadingMessage}
                </motion.p>
              </AnimatePresence>
            ) : filteredItems.length === 0 ? (
              <AnimatePresence mode="wait">
                <motion.p
                  key={emptyMessage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  className="text-center text-slate-400 py-20 font-elysia-display text-xl"
                >
                  {emptyMessage}
                </motion.p>
              </AnimatePresence>
            ) : (
              filteredItems.map((item) => (
                <TimelineCard key={item.id} item={item} />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const TimelineCard: React.FC<{ item: RecordSummary }> = ({ item }) => {
  const queryClient = useQueryClient();
  const isPublic = item.visibilityIntent === "public";
  const publicationMeta = getPublicationStatusMeta(item.publicationStatus);

  const visibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => updateRecordVisibility(id, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
    },
  });

  const toggleVisibility = () => {
    if (item.id.startsWith("test-")) {
       // Mock for test data
       queryClient.setQueryData(["home-feed"], (old: HomeFeedResponse | undefined) => {
         if (!old) return old;
         return {
           ...old,
           items: old.items.map((i: RecordSummary) => i.id === item.id ? { ...i, visibilityIntent: isPublic ? "private" : "public" } : i)
         };
       });
       return;
    };
    visibilityMutation.mutate({ id: item.id, isPublic: !isPublic });
  };

  return (
    <div className="flex flex-col gap-4 group relative">
      {/* Time & Status Above Card */}
      <div className="flex items-center justify-between px-10 text-xs text-slate-400 font-bold tracking-widest uppercase">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-pink-300" />
          {new Date(item.createdAt).toLocaleString("zh-CN", {
            hour12: false,
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>

        <button
          onClick={toggleVisibility}
          disabled={visibilityMutation.isPending}
          className={`flex items-center gap-2 transition-all hover:scale-105 ${isPublic ? "text-blue-400" : "text-slate-400"}`}
        >
          {isPublic ? (
            <>
              <Globe className="w-4 h-4" />
              <span className="drop-shadow-sm">公开共鸣</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>私密记忆</span>
            </>
          )}
        </button>
      </div>

      <LiquidCard className="bg-white/50 dark:bg-black/20 backdrop-blur-xl border-white/60 dark:border-white/10 p-10 flex flex-col gap-8 shadow-xl hover:shadow-2xl transition-all duration-500">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.12em] uppercase ${getStatusBadgeClasses(publicationMeta.tone)}`}
          >
            {publicationMeta.label}
          </span>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-300/80">
            {publicationMeta.detail}
          </p>
        </div>

        <div className="flex items-start justify-between gap-6">
          <h3 className="font-elysia-display text-2xl text-slate-700 dark:text-white font-bold leading-tight flex-1">
            {item.moodPhrase}
          </h3>

          {/* Emotions on the right of title */}
          {item.extraEmotions && item.extraEmotions.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end pt-1 shrink-0 max-w-[200px]">
              {item.extraEmotions.map(e => (
                <span key={e} className="px-3 py-1 rounded-full bg-pink-100/40 dark:bg-pink-900/10 border-2 border-pink-200/30 dark:border-pink-800/20 text-[10px] font-bold text-pink-600 dark:text-pink-300 shadow-sm">
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>

        {item.quote && (
          <div className="relative pl-4 py-1 my-6">
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-pink-300/60 rounded-full shadow-glow" />
            <p className="italic text-slate-600 dark:text-slate-300 text-base leading-relaxed font-medium">
              {item.quote}
            </p>
          </div>
        )}

        {item.description && (
          <div className="flex flex-col gap-2 pl-4">
            {item.description.split("\n").filter(p => p.trim()).map((p, i) => (
              <div key={i} className="relative text-slate-500 dark:text-slate-400 text-sm/1 leading-loose">
                <div className="absolute -left-4 top-3 w-2 h-2 bg-slate-200 dark:bg-slate-800 rounded-full" />
                {p}
              </div>
            ))}
          </div>
        )}
      </LiquidCard>
    </div>
  );
};
