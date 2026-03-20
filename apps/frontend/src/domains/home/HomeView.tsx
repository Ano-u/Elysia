import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LiquidCard } from "../../components/ui/LiquidCard";
import { MainInputCard } from "../../components/ui/MainInputCard";
import { ActionPairRow } from "../../components/ui/ActionPairRow";
import { HomeGuideOverlay, type HomeGuideStepContent } from "../../components/ui/HomeGuideOverlay";
import {
  createRecord,
  getHomeFeed,
  getOnboardingProgress,
  updateRecord,
  updateRecordVisibility,
} from "../../lib/apiClient";
import type { RecordSummary, VisibilityIntent, CreateRecordRequest } from "../../types/api";
import { Clock, PenLine, Loader, Check, X, Lock, Compass, Eye, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { pickRandomCopy, useRotatingCopy } from "../../lib/rotatingCopy";
import { getCreateSuccessMessage, getPublicationStatusMeta, type PublicationTone } from "../../lib/publicationCopy";
import { validateMoodPhraseLength } from "../../lib/moodPhraseValidation";

const DRAFT_KEY = "elysia-home-draft-v3";
const GUIDE_COMPLETED_STORAGE_PREFIX = "elysia-home-guide-completed-v1";
const GUIDE_FORCE_STORAGE_KEY = "elysia-home-guide-force";
const GUIDE_FORCE_QUERY_KEY = "guide";
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
const GUIDE_STEPS: HomeGuideStepContent[] = [
  {
    title: "先把这一刻轻轻交给爱莉",
    description: "从这里开始就好。哪怕只写一句，也已经很了不起，爱莉会认真听完它♪",
  },
  {
    title: "想去哪里，都由你决定",
    description: "这里可以切到记忆织网，也可以先留在时间流里慢慢回看。你不用着急做选择。",
  },
  {
    title: "每份心情都会有清楚去向",
    description: "爱莉会把状态告诉你：私密珍藏、温柔确认、送进星海，让你每一步都心里有底。",
  },
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
  moodLimit: [
    "标题最多 20 个字，英文最多 20 个词，精简一下我们再出发吧♪",
    "这一句标题有点长啦，最多 20 字或 20 个英文词，我们一起收束一下吧♪",
  ],
  contentTooLong: [
    "这次写得太满啦，描述部分最多 1000 字，稍微精简一下就能顺利送出♪",
    "爱莉已经收到你的心意啦，不过内容有点长，描述最多 1000 字，整理一下我们再发射吧♪",
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
  if (
    fallbackMessage.includes("标题最多 20 字")
    || fallbackMessage.includes("标题英文最多 20 个词")
    || fallbackMessage.includes("at most 20")
    || fallbackMessage.includes("at most 140")
  ) {
    return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.moodLimit);
  }
  if (fallbackMessage.includes("at most 1000") || fallbackMessage.includes("too_big")) {
    return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.contentTooLong);
  }
  if (fallbackMessage.includes("failed to fetch")) {
    return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.network);
  }
  return pickRandomCopy(CREATE_RECORD_ERROR_MESSAGES.generic);
}

type StatusBadgeInfo = { Icon: LucideIcon; classes: string };

function getStatusBadgeInfo(tone: PublicationTone): StatusBadgeInfo {
  switch (tone) {
    case "private":
      return { Icon: Lock, classes: "text-pink-600 dark:text-pink-200" };
    case "pending":
      return { Icon: Loader, classes: "text-sky-600 dark:text-sky-200" };
    case "review":
      return { Icon: Eye, classes: "text-violet-600 dark:text-violet-200" };
    case "caution":
      return { Icon: AlertTriangle, classes: "text-amber-700 dark:text-amber-200" };
    case "published":
      return { Icon: Compass, classes: "text-emerald-700 dark:text-emerald-200" };
    case "revise":
      return { Icon: PenLine, classes: "text-rose-700 dark:text-rose-200" };
    default:
      return { Icon: Loader, classes: "text-slate-600 dark:text-slate-200" };
  }
}

interface HomeViewProps {
  onNavigate: (view: "home" | "universe" | "mindmap" | "admin") => void;
  viewerUserId?: string | null;
  authReady?: boolean;
  isLocalDev?: boolean;
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

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  viewerUserId = null,
  authReady = true,
  isLocalDev = false,
}) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftPayload>(readInitialDraft);
  const [showOnlyPublic, setShowOnlyPublic] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (!feedbackMessage) return;
    feedbackTimerRef.current = setTimeout(() => setFeedbackMessage(null), 3000);
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, [feedbackMessage]);

  const saveEventTokenRef = useRef(0);
  const [saveAnimationEvent, setSaveAnimationEvent] = useState<{ token: number; status: "success" | "error" } | null>(null);
  const [guideMode, setGuideMode] = useState<"hidden" | "welcome" | "spotlight">("hidden");
  const [guideStep, setGuideStep] = useState(0);
  const [guideTargetRect, setGuideTargetRect] = useState<DOMRect | null>(null);
  const [guideTargetRadius, setGuideTargetRadius] = useState<number>(26);
  const composerGuideRef = useRef<HTMLDivElement>(null);
  const timelineSwitchGuideRef = useRef<HTMLDivElement>(null);
  const timelineListGuideRef = useRef<HTMLDivElement>(null);

  const {
    data: feedData,
    isLoading: isFeedLoading,
    isError: isFeedError,
    error: feedError,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: ["home-feed"],
    queryFn: () => getHomeFeed(20),
  });

  const { data: onboardingData } = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: getOnboardingProgress,
  });

  const guideStorageKey = `${GUIDE_COMPLETED_STORAGE_PREFIX}:${viewerUserId ?? "anonymous"}`;
  const isGuideVisible = guideMode !== "hidden";
  const isGuideSpotlight = guideMode === "spotlight";
  const activeGuideRef =
    guideStep === 0 ? composerGuideRef : guideStep === 1 ? timelineSwitchGuideRef : timelineListGuideRef;

  const closeGuide = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(guideStorageKey, String(Date.now()));
    }
    setGuideMode("hidden");
    setGuideTargetRect(null);
    setGuideTargetRadius(26);
  };

  const handleGuideStart = () => {
    setGuideStep(0);
    setGuideMode("spotlight");
  };

  const handleGuideBack = () => {
    setGuideStep((current) => Math.max(0, current - 1));
  };

  const handleGuideNext = () => {
    if (guideStep >= GUIDE_STEPS.length - 1) {
      closeGuide();
      return;
    }
    setGuideStep((current) => current + 1);
  };

  const handleGuideSkip = () => {
    closeGuide();
  };

  const emitSaveAnimationEvent = (status: "success" | "error") => {
    saveEventTokenRef.current += 1;
    setSaveAnimationEvent({ token: saveEventTokenRef.current, status });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateRecordRequest) => createRecord(payload),
    onSuccess: (response) => {
      emitSaveAnimationEvent("success");
      setDraft({ ...draft, moodPhrase: "", quote: "", description: "", extraEmotions: [] });
      localStorage.removeItem(DRAFT_KEY);
      setFeedbackTone("success");
      setFeedbackMessage(getCreateSuccessMessage(response.publishStatus.status));
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      queryClient.invalidateQueries({ queryKey: ["universe"] });
    },
    onError: (error) => {
      emitSaveAnimationEvent("error");
      setFeedbackTone("error");
      setFeedbackMessage(resolveCreateErrorMessage(error));
    },
  });

  const handleSave = () => {
    const moodPhrase = draft.moodPhrase.trim();
    const moodCheck = validateMoodPhraseLength(moodPhrase);
    if (!moodCheck.ok) {
      emitSaveAnimationEvent("error");
      setFeedbackTone("error");
      setFeedbackMessage(moodCheck.reason);
      return;
    }

    createMutation.mutate({
      moodPhrase,
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

  useEffect(() => {
    if (!authReady || typeof window === "undefined") {
      return;
    }

    const queryGuideValue = new URLSearchParams(window.location.search).get(GUIDE_FORCE_QUERY_KEY);
    const forceByQuery = queryGuideValue === "1";
    const disableGuideByQuery = queryGuideValue === "0";
    const forceByStorage = window.localStorage.getItem(GUIDE_FORCE_STORAGE_KEY) === "1";
    const shouldForceGuide = isLocalDev && (forceByQuery || forceByStorage);

    if (isLocalDev) {
      if (disableGuideByQuery) {
        return;
      }
      setGuideStep(0);
      setGuideMode("welcome");
      return;
    }

    if (shouldForceGuide) {
      setGuideStep(0);
      setGuideMode("welcome");
      return;
    }

    const completedAt = window.localStorage.getItem(guideStorageKey);
    if (!completedAt) {
      setGuideStep(0);
      setGuideMode("welcome");
    }
  }, [authReady, guideStorageKey, isLocalDev]);

  useEffect(() => {
    if (!isGuideSpotlight || typeof window === "undefined") {
      return;
    }

    const node = activeGuideRef.current;
    if (!node) {
      return;
    }

    node.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });

    const parseRadiusValue = (value: string): number => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const resolveRadius = (element: HTMLElement): number => {
      const directRadius = parseRadiusValue(window.getComputedStyle(element).borderTopLeftRadius);
      if (directRadius > 0) {
        return directRadius;
      }
      const firstChild = element.firstElementChild as HTMLElement | null;
      if (!firstChild) {
        return 26;
      }
      const childRadius = parseRadiusValue(window.getComputedStyle(firstChild).borderTopLeftRadius);
      return childRadius > 0 ? childRadius : 26;
    };

    let frameId = 0;
    const syncRect = () => {
      frameId = 0;
      const currentNode = activeGuideRef.current;
      if (!currentNode) {
        return;
      }
      setGuideTargetRect(currentNode.getBoundingClientRect());
      setGuideTargetRadius(resolveRadius(currentNode));
    };
    const scheduleSync = () => {
      if (frameId) {
        return;
      }
      frameId = window.requestAnimationFrame(syncRect);
    };

    scheduleSync();
    const settleTimer = window.setTimeout(scheduleSync, 240);

    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);

    return () => {
      window.clearTimeout(settleTimer);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
    };
  }, [activeGuideRef, isGuideSpotlight, guideStep]);

  useEffect(() => {
    if (!isGuideVisible || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.localStorage.setItem(guideStorageKey, String(Date.now()));
        setGuideMode("hidden");
        setGuideTargetRect(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGuideVisible, guideStorageKey]);

  const mindMapProgress = onboardingData ? onboardingData.progress.completed_days.length : 0;
  const isMindMapActive = mindMapProgress >= 7;
  const loadingMessage = useRotatingCopy(FEED_LOADING_MESSAGES, 10000, isFeedLoading);
  const feedErrorMessage = isFeedError ? resolveCreateErrorMessage(feedError) : null;

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
  const guideStepContent = GUIDE_STEPS[guideStep] ?? GUIDE_STEPS[0];
  const guideTargetClass = (index: number): string =>
    isGuideSpotlight && guideStep === index ? "relative z-[122]" : "relative z-10";

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

          <div ref={composerGuideRef} className={`${guideTargetClass(0)} rounded-[2.25rem]`}>
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
              saveAnimationEvent={saveAnimationEvent}
              feedbackMessage={feedbackMessage}
              feedbackTone={feedbackTone}
            />
          </div>
        </section>

        {/* Section 2: HomeTimeline */}
        <section className="w-full flex flex-col gap-10 relative max-w-4xl">
          {/* Vertical Guide Line */}
          <div className="absolute left-[-2.5rem] top-0 bottom-0 w-[2px] bg-gradient-to-b from-slate-200 via-slate-300 to-transparent dark:from-white/5 dark:via-white/10 hidden lg:block" />

          <div ref={timelineSwitchGuideRef} className={`${guideTargetClass(1)} rounded-[1.35rem] flex items-center justify-between px-6`}>
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

          <div ref={timelineListGuideRef} className={`${guideTargetClass(2)} rounded-[1.75rem] grid grid-cols-1 gap-10 px-6`}>
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
            ) : isFeedError ? (
              <div className="flex flex-col items-center gap-4 rounded-[1.25rem] border border-rose-200/70 bg-white/70 px-6 py-10 text-center shadow-sm dark:border-rose-400/20 dark:bg-black/25">
                <p className="font-elysia-display text-lg text-rose-500 dark:text-rose-200">往世乐土刚刚起雾啦</p>
                <p className="max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-300/85">
                  {feedErrorMessage ?? "爱莉刚刚没能把时间流展开，我们再试一次就好♪"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void refetchFeed();
                  }}
                  className="rounded-full border border-white/70 bg-white/85 px-4 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white dark:border-white/25 dark:bg-white/15 dark:text-slate-100 dark:hover:bg-white/25"
                >
                  再试一次
                </button>
              </div>
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
      <HomeGuideOverlay
        open={isGuideVisible}
        mode={guideMode === "welcome" ? "welcome" : "spotlight"}
        stepIndex={guideStep}
        stepCount={GUIDE_STEPS.length}
        step={guideStepContent}
        targetRect={guideTargetRect}
        targetRadius={guideTargetRadius}
        onStart={handleGuideStart}
        onBack={handleGuideBack}
        onNext={handleGuideNext}
        onSkip={handleGuideSkip}
      />
    </div>
  );
};

const TimelineCard: React.FC<{ item: RecordSummary }> = ({ item }) => {
  const queryClient = useQueryClient();
  const [mockSnapshot, setMockSnapshot] = useState<Partial<RecordSummary> | null>(null);
  const currentItem = mockSnapshot ? { ...item, ...mockSnapshot } : item;
  const isPublic = currentItem.visibilityIntent === "public";
  const publicationMeta = getPublicationStatusMeta(currentItem.publicationStatus);
  const emotionTags = currentItem.extraEmotions && currentItem.extraEmotions.length > 0 ? currentItem.extraEmotions : currentItem.tags ?? [];
  const [isEditing, setIsEditing] = useState(false);
  const [editMoodPhrase, setEditMoodPhrase] = useState(currentItem.moodPhrase);
  const [editQuote, setEditQuote] = useState(currentItem.quote ?? "");
  const [editDescription, setEditDescription] = useState(currentItem.description ?? "");
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const editFeedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (editFeedbackTimerRef.current) clearTimeout(editFeedbackTimerRef.current);
    if (!editFeedback) return;
    editFeedbackTimerRef.current = setTimeout(() => setEditFeedback(null), 3000);
    return () => { if (editFeedbackTimerRef.current) clearTimeout(editFeedbackTimerRef.current); };
  }, [editFeedback]);

  const isMockItem = currentItem.id.startsWith("test-");
  const canEditByStatus = ["private", "pending_auto", "pending_manual", "published"].includes(currentItem.publicationStatus);

  const visibilityMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => updateRecordVisibility(id, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
    },
  });

  const editMutation = useMutation({
    mutationFn: (payload: { moodPhrase: string; quote: string | null; description: string }) =>
      updateRecord(currentItem.id, payload),
    onSuccess: () => {
      setIsEditing(false);
      setEditFeedback("修改已提交，正在进行二次审核呀♪");
      queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      queryClient.invalidateQueries({ queryKey: ["universe"] });
    },
    onError: (error) => {
      setEditFeedback(resolveCreateErrorMessage(error));
    },
  });

  useEffect(() => {
    if (isEditing) return;
    setEditMoodPhrase(currentItem.moodPhrase);
    setEditQuote(currentItem.quote ?? "");
    setEditDescription(currentItem.description ?? "");
  }, [isEditing, currentItem.moodPhrase, currentItem.quote, currentItem.description, currentItem.updatedAt]);

  const toggleVisibility = () => {
    if (isMockItem) {
      setMockSnapshot((prev) => ({
        ...(prev ?? {}),
        visibilityIntent: isPublic ? "private" : "public",
        updatedAt: new Date().toISOString(),
      }));
      return;
    }
    visibilityMutation.mutate({ id: currentItem.id, isPublic: !isPublic });
  };

  const openEditMode = () => {
    if (!canEditByStatus) {
      toggleVisibility();
      return;
    }
    setEditFeedback(null);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setEditMoodPhrase(currentItem.moodPhrase);
    setEditQuote(currentItem.quote ?? "");
    setEditDescription(currentItem.description ?? "");
    setEditFeedback(null);
    setIsEditing(false);
  };

  const handleEditSave = () => {
    const moodPhrase = editMoodPhrase.trim();
    const moodCheck = validateMoodPhraseLength(moodPhrase);
    if (!moodCheck.ok) {
      setEditFeedback(moodCheck.reason);
      return;
    }

    if (isMockItem) {
      setMockSnapshot((prev) => ({
        ...(prev ?? {}),
        moodPhrase,
        quote: editQuote.trim().length > 0 ? editQuote.trim() : null,
        description: editDescription.trim().length > 0 ? editDescription.trim() : null,
        publicationStatus: "pending_second_review",
        updatedAt: new Date().toISOString(),
      }));
      setIsEditing(false);
      setEditFeedback("修改已提交，正在进行二次审核呀♪");
      return;
    }

    editMutation.mutate({
      moodPhrase,
      quote: editQuote.trim().length > 0 ? editQuote.trim() : null,
      description: editDescription.trim(),
    });
  };

  const actionBusy = visibilityMutation.isPending || editMutation.isPending;
  const badgeInfo = getStatusBadgeInfo(publicationMeta.tone);

  return (
    <div className="flex flex-col gap-4 group relative">
      {/* Time & Status Above Card */}
      <div className="flex items-center justify-between px-10 text-xs text-slate-400 font-bold tracking-widest uppercase">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-pink-300" />
          {new Date(currentItem.createdAt).toLocaleString("zh-CN", {
            hour12: false,
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>

        <span
          title={isEditing ? "修改完成后会进入二次审核♪" : publicationMeta.detail}
          className={`inline-flex items-center gap-2 cursor-default`}
        >
          {isEditing ? <PenLine className="w-4 h-4 text-violet-500 dark:text-violet-300" /> : <badgeInfo.Icon className={`w-4 h-4 ${badgeInfo.classes}`} />}
          {isEditing ? "修改完成后会进入二次审核" : publicationMeta.label}
        </span>
      </div>

      <LiquidCard className="bg-white/50 dark:bg-black/20 backdrop-blur-xl border-white/60 dark:border-white/10 p-10 flex flex-col gap-8 shadow-xl hover:shadow-2xl transition-all duration-500">
        {isEditing ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-400">标题</span>
              <input
                type="text"
                maxLength={200}
                value={editMoodPhrase}
                onChange={(e) => setEditMoodPhrase(e.target.value)}
                placeholder="把这一刻轻轻写成标题吧♪"
                className="w-full bg-white/60 dark:bg-black/30 border-none rounded-2xl px-4 py-3 text-base text-slate-700 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-200/60"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-400">今日誓言</span>
              <input
                type="text"
                maxLength={200}
                value={editQuote}
                onChange={(e) => setEditQuote(e.target.value)}
                placeholder="要不要把这一句也轻轻补上？"
                className="w-full bg-white/50 dark:bg-black/25 border-none rounded-2xl px-4 py-3 text-sm italic text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/60"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-400">描述</span>
              <textarea
                value={editDescription}
                maxLength={1000}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="补一两句细节，让这份心意更完整♪"
                className="w-full min-h-[140px] resize-none bg-white/50 dark:bg-black/25 border-none rounded-2xl px-4 py-3 text-sm leading-relaxed text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/60"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleEditCancel}
                className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
              >
                <X className="w-3.5 h-3.5" />
                取消
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={editMutation.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-300/20 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:bg-emerald-500/30"
              >
                <Check className="w-3.5 h-3.5" />
                {editMutation.isPending ? "提交中..." : "提交修改"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-6 my-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h3 className="font-elysia-display text-2xl text-slate-700 dark:text-white font-bold leading-tight break-words [overflow-wrap:anywhere]">
                  {currentItem.moodPhrase}
                </h3>
                {canEditByStatus && (
                  <button
                    type="button"
                    onClick={openEditMode}
                    disabled={actionBusy}
                    title="修改"
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 p-1 rounded-full text-violet-400 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-100"
                  >
                    <PenLine className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Emotions on the right of title */}
              {emotionTags.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-end pt-1 shrink-0 max-w-[200px]">
                  {emotionTags.map(e => (
                    <span key={e} className="px-3 py-1 rounded-full bg-pink-100/40 dark:bg-pink-900/10 border-2 border-pink-200/30 dark:border-pink-800/20 text-[10px] font-bold text-pink-600 dark:text-pink-300 shadow-sm">
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {currentItem.quote && (
              <div className="relative pl-4 py-1 my-4">
                <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-pink-300/60 rounded-full shadow-glow" />
                <p className="italic text-slate-600 dark:text-slate-300 text-base leading-relaxed font-medium break-words [overflow-wrap:anywhere]">
                  {currentItem.quote}
                </p>
              </div>
            )}

            {currentItem.description && (
              <div className="flex flex-col gap-2 pl-4 my-4">
                {currentItem.description.split("\n").filter(p => p.trim()).map((p, i) => (
                  <div key={i} className="relative text-slate-500 dark:text-slate-400 text-sm/1 leading-loose whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    <div className="absolute -left-4 top-3 w-2 h-2 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    {p}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {editFeedback && (
          <div className="rounded-[1.2rem] border border-violet-200/70 bg-violet-50/70 px-4 py-2 text-sm text-violet-700 dark:border-violet-300/20 dark:bg-violet-500/15 dark:text-violet-200">
            {editFeedback}
          </div>
        )}
      </LiquidCard>
    </div>
  );
};
