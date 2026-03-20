import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
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

const DRAFT_KEY = "elysia-home-draft-v3";

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
    onSuccess: () => {
      setDraft({ ...draft, moodPhrase: "", quote: "", description: "", extraEmotions: [] });
      localStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
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

  const allItems = [...TEST_DATA, ...(feedData?.items ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredItems = allItems.filter(item =>
    !showOnlyPublic || item.visibilityIntent === "public"
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
            <h1 className="font-elysia-title elysia-dream-title text-[4rem] sm:text-[5.4rem] font-medium tracking-tight">
              Elysia
            </h1>
            <p className="mt-2 font-elysia-display text-base sm:text-lg text-slate-500 dark:text-slate-300">
              粉色天空坠入往世乐土，愿你在誓言与希望里安心书写。
            </p>
          </motion.div>

          <MainInputCard
            moodPhrase={draft.moodPhrase}
            setMoodPhrase={(v) => setDraft({ ...draft, moodPhrase: v })}
            quote={draft.quote}
            setQuote={(v) => setDraft({ ...draft, quote: v })}
            description={draft.description}
            setDescription={(v) => setDraft({ ...draft, description: v })}
            extraEmotions={draft.extraEmotions}
            setExtraEmotions={(v) => setDraft({ ...draft, extraEmotions: v })}
            isPublic={draft.visibilityIntent === "public"}
            onPublicToggle={(isP) => setDraft({ ...draft, visibilityIntent: isP ? "public" : "private" })}
            onSave={handleSave}
            onJumpUniverse={() => onNavigate("universe")}
            isPending={createMutation.isPending}
          />
        </section>

        {/* Section 2: HomeTimeline */}
        <section className="w-full flex flex-col gap-10 relative max-w-4xl">
          {/* Vertical Guide Line */}
          <div className="absolute left-[-2.5rem] top-0 bottom-0 w-[2px] bg-gradient-to-b from-slate-200 via-slate-300 to-transparent dark:from-white/5 dark:via-white/10 hidden lg:block" />

          <div className="flex items-center justify-between px-6">
            <h2 className="font-elysia-title elysia-dream-title text-[2.9rem] sm:text-[3.4rem] font-medium tracking-tight">往世乐土</h2>

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
              <p className="text-center text-slate-400 py-20 font-elysia-display text-xl">正在捧起你最近的心情片段...</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-center text-slate-400 py-20 font-elysia-display text-xl">这里还是安静的，写下一句来点亮它吧。</p>
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
