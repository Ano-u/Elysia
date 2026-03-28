import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "../../store/uiStore";
import { LiquidCard } from "../../components/ui/LiquidCard";
import { MainInputCard } from "../../components/ui/MainInputCard";
import { HomeGuideOverlay, type HomeGuideStepContent } from "../../components/ui/HomeGuideOverlay";
import { MoodStripSelector } from "../../components/ui/MoodStripSelector";
import { AsymmetricTogglePanel } from "../../components/ui/AsymmetricTogglePanel";
import { NavIconButton } from "../../components/ui/NavIconButton";
import {
  createRecord,
  getHomeFeed,
  getOnboardingProgress,
  updateRecord,
  updateRecordVisibility,
  updateOnboardingGuideState,
  completeOnboardingDay,
} from "../../lib/apiClient";
import type { RecordSummary, VisibilityIntent, CreateRecordRequest } from "../../types/api";
import { Clock, PenLine, Loader, Check, X, Trash2, Lock, Compass, Eye, AlertTriangle, Quote, ListChevronsUpDown, Lightbulb, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { pickRandomCopy, useRotatingCopy } from "../../lib/rotatingCopy";
import { getCreateSuccessMessage, getPublicationStatusMeta, type PublicationTone } from "../../lib/publicationCopy";
import { validateMoodPhraseLength } from "../../lib/moodPhraseValidation";

const DRAFT_KEY = "elysia-home-draft-v3";
const GUIDE_COMPLETED_STORAGE_PREFIX = "elysia-home-guide-completed-v1";
const GUIDE_FORCE_STORAGE_KEY = "elysia-home-guide-force";
const GUIDE_FORCE_QUERY_KEY = "guide";
const FEED_LOADING_MESSAGES = [
  "别心急，爱莉正在为你整理闪闪发光的心情呢♪",
  "请稍等一下，爱莉正在收集刚刚落下的星光♪",
  "这些点滴记忆马上就来，可爱的少女可是无所不能的呀♪",
];
const FEED_EMPTY_MESSAGES = [
  "这里还有些寂寞呢，要不要留下点只属于你的足迹呀？♪",
  "往世乐土还很安静呢，快写下第一句话，为我们点亮前行的灯火吧♪",
  "今天想和我说些什么呢？爱莉会把你的心意全都珍藏在心底哦♪",
];
const GUIDE_STEPS: HomeGuideStepContent[] = [
  {
    title: "把这一刻交给爱莉吧♪",
    description: "就从这里开始吧，无论你想说什么，爱莉都会认真听完的哦♪",
  },
  {
    title: "想去哪里，都由你来决定♪",
    description: "无论是编织记忆，还是慢慢回看过去，都不用着急，就像美丽的少女总有自己的步调嘛♪",
  },
  {
    title: "你的心意，爱莉全都收到啦♪",
    description: "无论是藏作小秘密，还是送进星海，我都会好好为你守护的♪",
  },
];
const CREATE_RECORD_ERROR_MESSAGES = {
  unauthorized: [
    "哎呀，爱莉没有认出你呢，重新登录一下，让我们再邂逅一次好不好呀？",
    "哎呀，好像少了点确认呢，等会儿我们再试一次吧♪",
  ],
  accessBlocked: [
    "哎呀，你的名字还在往世乐土的门前等候呢，别心急，爱莉会在这里等你的哦♪",
    "现在还在审核中呢，好事情总是值得多等一会儿的，对不对？",
  ],
  riskControl: [
    "哎呀，拦得有些紧呢。不想前进的时候，就暂且停下脚步休息一下吧♪",
    "好啦，冷静一下♪ 现在还在冷却中，过会儿再来和我说说悄悄话吧。",
  ],
  network: [
    "哎呀，网络好像断掉了。不过别担心，无论路有多长，我始终都会在你身边哦♪",
    "刚才那阵风太急了，爱莉没能听清，我们稍后再试一次好不好呀？",
  ],
  moodLimit: [
    "哎呀，标题最多只能写 20 个字哦，精简一下，把悬念留给下一次吧♪",
    "有些时候，短短的一句话就足够闪耀了呢。标题最多 20 个字哦，再试一次吧♪",
  ],
  contentTooLong: [
    "哎呀，你写了好多呀，我都看不过来了呢。描述最多 1000 字，稍微精简一下吧？♪",
    "虽然很想全听完，但这次写得太满了哦，超过 1000 字啦，收敛一下心情再出发吧♪",
  ],
  generic: [
    "哎呀，出了一点点小插曲。别生气嘛♪ 我们再试一次好不好？",
    "遗憾也是故事的一环哦，刚刚好像没接到你的心意，再给爱莉一次机会好不好？",
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
  theme?: "light" | "dark";
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

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  viewerUserId = null,
  authReady = true,
  isLocalDev = false,
  theme = "light",
}) => {
  const queryClient = useQueryClient();
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [draft, setDraft] = useState<DraftPayload>(readInitialDraft);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (!feedbackMessage) return;
    feedbackTimerRef.current = setTimeout(() => setFeedbackMessage(null), 3000);
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, [feedbackMessage]);

  const [guideMode, setGuideMode] = useState<"hidden" | "welcome" | "spotlight" | "safety">("hidden");
  const [guideStep, setGuideStep] = useState(0);
  const [guideTargetRect, setGuideTargetRect] = useState<DOMRect | null>(null);
  const [guideTargetRadius, setGuideTargetRadius] = useState<number>(26);
  const composerGuideRef = useRef<HTMLDivElement>(null);
  const timelineSwitchGuideRef = useRef<HTMLDivElement>(null);
  const timelineListGuideRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll({ container: scrollContainerRef });
  const smoothScrollY = useSpring(scrollY, { stiffness: 80, damping: 10, bounce: 0.01, mass: 0.1, restDelta: 0.001 });
  const parallaxY = useTransform(smoothScrollY, [0, 800], [0, 300]);
  const headerOpacity = useTransform(smoothScrollY, [0, 200, 350], [1, 0.9, 0]);
  const headerScale = useTransform(smoothScrollY, [0, 350], [1, 0.95]);

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

  const closeGuide = (skipped = false) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(guideStorageKey, String(Date.now()));
    }
    setGuideMode("hidden");
    setGuideTargetRect(null);
    setGuideTargetRadius(26);

    const version = onboardingData?.guide.version ?? "v1";
    const payload = skipped
      ? { skippedAt: new Date().toISOString(), version }
      : { completedAt: new Date().toISOString(), version };

    updateOnboardingGuideState(payload).catch((e) => {
      console.error("Failed to update guide state", e);
    });
  };

  const handleGuideStart = () => {
    setGuideStep(0);
    setGuideMode("spotlight");
    updateOnboardingGuideState({ lastSeenStep: 0, version: onboardingData?.guide.version ?? "v1" }).catch(() => {});
  };

  const handleGuideBack = () => {
    setGuideStep((current) => {
      const next = Math.max(0, current - 1);
      updateOnboardingGuideState({ lastSeenStep: next, version: onboardingData?.guide.version ?? "v1" }).catch(() => {});
      return next;
    });
  };

  const handleGuideNext = () => {
    const stepsCount = onboardingData?.guide.steps.length ?? GUIDE_STEPS.length;
    if (guideStep >= stepsCount - 1) {
      if (onboardingData?.guide.safetyCard) {
        setGuideMode("safety");
      } else {
        closeGuide(false);
      }
      return;
    }
    setGuideStep((current) => {
      const next = current + 1;
      updateOnboardingGuideState({ lastSeenStep: next, version: onboardingData?.guide.version ?? "v1" }).catch(() => {});
      return next;
    });
  };

  const handleSafetyConfirm = () => {
    closeGuide(false);
  };

  const handleGuideSkip = () => {
    closeGuide(true);
  };

  const [completingTaskDay, setCompletingTaskDay] = useState<number | null>(null);
  const completeDayMutation = useMutation({
    mutationFn: (day: number) => completeOnboardingDay(day),
    onSuccess: (_, day) => {
      setCompletingTaskDay(day);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["onboarding-progress"] });
      }, 600); // 预留时间给退场动画
    }
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

      // Navigate after showing the success feedback briefly
      // setTimeout(() => {
      //   onNavigate(draft.visibilityIntent === "public" ? "universe" : "mindmap");
      // }, 1200);
    },
    onError: (error) => {
      setFeedbackTone("error");
      setFeedbackMessage(resolveCreateErrorMessage(error));
    },
  });

  const handleEmotionToggle = (tag: string) => {
    const next = draft.extraEmotions.includes(tag)
      ? draft.extraEmotions.filter((t) => t !== tag)
      : draft.extraEmotions.length < 8
        ? [...draft.extraEmotions, tag]
        : draft.extraEmotions;
    setDraft({ ...draft, extraEmotions: next });
    setFeedbackMessage(null);
  };

  const handleSave = () => {
    const moodPhrase = draft.moodPhrase.trim();
    const moodCheck = validateMoodPhraseLength(moodPhrase);
    if (!moodCheck.ok) {
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
    if (!authReady || typeof window === "undefined" || !onboardingData) {
      return;
    }

    const queryGuideValue = new URLSearchParams(window.location.search).get(GUIDE_FORCE_QUERY_KEY);
    const forceByQuery = queryGuideValue === "1";
    const disableGuideByQuery = queryGuideValue === "0";
    const forceByStorage = window.localStorage.getItem(GUIDE_FORCE_STORAGE_KEY) === "1";
    // Modified: In local dev, always force guide unless explicitly disabled by query (?guide=0)
    const shouldForceGuide = isLocalDev ? !disableGuideByQuery : (forceByQuery || forceByStorage);

    if (disableGuideByQuery) {
      return;
    }

    if (shouldForceGuide) {
      setGuideStep(0);
      setGuideMode("welcome");
      return;
    }

    const guideState = onboardingData.guide.state;
    if (!guideState.completedAt && !guideState.skippedAt) {
      setGuideStep(guideState.lastSeenStep || 0);
      if (guideState.lastSeenStep > 0) {
        setGuideMode("spotlight");
      } else {
        setGuideMode("welcome");
      }
    } else {
      // API says completed or skipped, but check if we need to force via localStorage logic fallback? No, prefer backend.
      setGuideMode("hidden");
    }
  }, [authReady, isLocalDev, onboardingData]);

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

  const loadingMessage = useRotatingCopy(FEED_LOADING_MESSAGES, 10000, isFeedLoading);
  const feedErrorMessage = isFeedError ? resolveCreateErrorMessage(feedError) : null;

  const allItems = [...(feedData?.items ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const emptyMessage = useRotatingCopy(
    FEED_EMPTY_MESSAGES,
    10000,
    !isFeedLoading && allItems.length === 0,
  );

  const activeGuideSteps = onboardingData?.guide.steps && onboardingData.guide.steps.length > 0
    ? onboardingData.guide.steps
    : GUIDE_STEPS;
  const guideStepContent = activeGuideSteps[guideStep] ?? activeGuideSteps[0];

  const guideTargetClass = (index: number): string =>
    isGuideSpotlight && guideStep === index ? "relative z-[122]" : "relative z-10";

  return (
    <div ref={scrollContainerRef} className="relative h-full w-full overflow-y-auto overflow-x-hidden hide-scrollbar bg-[#f8fbff] dark:bg-[#0d1422] transition-all duration-700">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={reduceMotion ? { scale: 1, x: 0, y: 0 } : { scale: [1, 1.05, 1], x: [0, -10, 0], y: [0, 5, 0] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 40, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <img
            src={theme === "dark" ? "/Arc-City.webp" : "/Timeless-Grand-Hall.webp"}
            alt="Elysia Background"
            className="w-full h-full object-cover opacity-60 dark:opacity-20 mix-blend-screen dark:mix-blend-lighten"
          />
        </motion.div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(255,255,255,0.7),transparent_45%),radial-gradient(circle_at_82%_12%,rgba(255,231,242,0.52),transparent_38%),radial-gradient(circle_at_50%_90%,rgba(214,236,255,0.3),transparent_50%)] dark:hidden" />
      </div>

      <motion.div
        style={{ y: parallaxY }}
        className="absolute top-0 left-0 right-0 z-[5] pointer-events-none"
      >
        <motion.div
          style={{ opacity: headerOpacity, scale: headerScale }}
          className="flex flex-col items-center pt-[64px] pb-4 px-4 w-full origin-top"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center pointer-events-auto"
          >
            <h1 className="font-elysia-title elysia-dream-title text-[4rem] sm:text-[5.4rem] font-medium tracking-tight">
              Elysia
            </h1>
            <p className="mt-4 font-elysia-display text-base sm:text-lg text-slate-500 dark:text-slate-300">
              粉色天光落进往世乐土，Elysia会永远回应你的期待♪
            </p>
          </motion.div>
        </motion.div>
      </motion.div>

      <div className="relative z-10 flex flex-col items-center max-w-6xl mx-auto px-4 pt-[260px] sm:pt-[290px] pb-32 gap-16">
        {/* Section 1: Landing Header & Input */}
        <section className="w-full flex flex-col items-center gap-8 max-w-4xl">
          {onboardingData && (
            <div className="w-full px-2 sm:px-0">
              <AnimatePresence mode="popLayout">
                {onboardingData.restartSuggestion?.shouldShow ? (
                  <motion.div
                    key="restart-suggestion"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full flex flex-col gap-2.5 rounded-[1.5rem] bg-pink-50/60 dark:bg-pink-950/20 border border-pink-100/80 dark:border-pink-900/30 p-5 backdrop-blur-md"
                  >
                    <h3 className="font-elysia-display text-base text-pink-700 dark:text-pink-300 font-medium">
                      {onboardingData.restartSuggestion.headline}
                    </h3>
                    <p className="text-sm text-pink-600/85 dark:text-pink-400/85 leading-relaxed">
                      {onboardingData.restartSuggestion.body}
                    </p>
                  </motion.div>
                ) : (() => {
                  const currentTask = onboardingData.tasks?.find(t => t.day === onboardingData.progress.current_day);
                  if (currentTask && completingTaskDay !== currentTask.day) {
                    return (
                      <motion.div
                        key={`task-day-${currentTask.day}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95, filter: "blur(4px)" }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                        className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[1.5rem] bg-white/50 dark:bg-black/30 border border-white/60 dark:border-white/10 p-5 backdrop-blur-xl shadow-sm"
                      >
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tracking-widest uppercase bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300 px-2 py-0.5 rounded-full">
                              Day {currentTask.day}
                            </span>
                            <h3 className="font-elysia-display text-base text-slate-700 dark:text-slate-200 font-medium">
                              {currentTask.title}
                            </h3>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            {currentTask.description}
                          </p>
                          {currentTask.rewardText && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                              ✨ {currentTask.rewardText}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
                          {currentTask.ctaText && (
                            <button
                              className="rounded-full bg-slate-800 dark:bg-slate-200 px-4 py-2 text-xs sm:text-sm text-white dark:text-slate-900 transition-colors hover:bg-slate-700 dark:hover:bg-white"
                              onClick={() => {
                                const target = currentTask.ctaTarget;
                                if (target === 'mindmap') onNavigate('mindmap');
                                else if (target === 'universe') onNavigate('universe');
                                else {
                                  composerGuideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}
                            >
                              {currentTask.ctaText}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={completeDayMutation.isPending}
                            onClick={() => completeDayMutation.mutate(currentTask.day)}
                            title="标记完成"
                            className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-emerald-100 bg-emerald-50 text-emerald-500 transition-all hover:bg-emerald-500 hover:text-white dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:hover:bg-emerald-600 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  }
                  return null;
                })()}
              </AnimatePresence>

              {onboardingData.entryContext?.needsAccessApplication && onboardingData.entryContext.applicationHint && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full flex items-start gap-3.5 mt-2 px-5 py-4 rounded-[1.5rem] bg-white/50 dark:bg-black/30 border border-pink-100/80 dark:border-pink-900/30 backdrop-blur-md shadow-sm"
                >
                  <div className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-full bg-pink-50 text-pink-500 dark:bg-pink-950/30 dark:text-pink-400 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                      {onboardingData.entryContext.applicationHint}
                    </p>
                    {onboardingData.entryContext.estimatedReviewText && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        ✨ {onboardingData.entryContext.estimatedReviewText}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          )}

          <div ref={composerGuideRef} className={`${guideTargetClass(0)} rounded-[2.25rem] w-full flex flex-col gap-10`}>
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
              isPending={createMutation.isPending}
              extraEmotions={draft.extraEmotions}
              onToggleEmotion={handleEmotionToggle}
            />

            <div className="flex-1 min-w-0">
              <div className="flex-shrink-0 flex items-end justify-end mt-2 sm:mt-0 pb-3">
                <AsymmetricTogglePanel
                  currentState={draft.visibilityIntent === "public" ? "universe" : "mindmap"}
                  onStateChange={(newState) => {
                    setDraft({ ...draft, visibilityIntent: newState === "universe" ? "public" : "private" });
                    setFeedbackMessage(null);
                  }}
                  onSubmit={handleSave}
                  isPending={createMutation.isPending}
                />
              </div>
            </div>

            {/* Feedback message */}
            <AnimatePresence>
              {feedbackMessage ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`mx-6 rounded-[1.4rem] border px-4 py-3 text-sm leading-relaxed ${
                    feedbackTone === "error"
                      ? "border-amber-200/70 bg-amber-50/75 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200"
                      : "border-emerald-200/70 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200"
                  }`}
                >
                  {feedbackMessage}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        {/* Section 2: HomeTimeline */}
        <section className="w-full flex flex-col gap-10 relative max-w-4xl">
          {/* Vertical Guide Line */}
          <div className="absolute left-[-2.5rem] top-0 bottom-0 w-[2px] bg-gradient-to-b from-slate-200 via-slate-300 to-transparent dark:from-white/5 dark:via-white/10 hidden lg:block" />

          <div ref={timelineSwitchGuideRef} className={`${guideTargetClass(1)} rounded-[1.35rem] flex items-center justify-between px-6`}>
            <h2 className="font-elysia-title elysia-dream-title text-[2.9rem] sm:text-[3.4rem] tracking-tight">往世乐土</h2>
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
            ) : allItems.length === 0 ? (
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
              allItems.map((item) => (
                <TimelineCard key={item.id} item={item} />
              ))
            )}
          </div>
        </section>
      </div>
      <HomeGuideOverlay
        open={isGuideVisible}
        mode={guideMode === "welcome" ? "welcome" : guideMode === "safety" ? "safety" : "spotlight"}
        stepIndex={guideStep}
        stepCount={activeGuideSteps.length}
        step={guideStepContent}
        welcome={onboardingData?.guide ? {
          title: onboardingData.guide.welcomeTitle,
          description: onboardingData.guide.welcomeDescription,
          primaryAction: onboardingData.guide.welcomePrimaryAction,
          secondaryAction: onboardingData.guide.welcomeSecondaryAction,
        } : null}
        safety={onboardingData?.guide?.safetyCard ?? null}
        targetRect={guideTargetRect}
        targetRadius={guideTargetRadius}
        onStart={handleGuideStart}
        onBack={handleGuideBack}
        onNext={handleGuideNext}
        onSkip={handleGuideSkip}
        onSafetyConfirm={handleSafetyConfirm}
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
  const [editIsPublic, setEditIsPublic] = useState(isPublic);
  const [editMoodPhrase, setEditMoodPhrase] = useState(currentItem.moodPhrase);
  const [editQuote, setEditQuote] = useState(currentItem.quote ?? "");
  const [editDescription, setEditDescription] = useState(currentItem.description ?? "");
  const [editExtraEmotions, setEditExtraEmotions] = useState<string[]>(currentItem.extraEmotions ?? []);
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
    mutationFn: (payload: { moodPhrase: string; quote: string | null; description: string; extraEmotions?: string[] }) =>
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
    setEditIsPublic(isPublic);
    setEditMoodPhrase(currentItem.moodPhrase);
    setEditQuote(currentItem.quote ?? "");
    setEditDescription(currentItem.description ?? "");
    setEditExtraEmotions(currentItem.extraEmotions ?? []);
  }, [isEditing, isPublic, currentItem.moodPhrase, currentItem.quote, currentItem.description, currentItem.extraEmotions, currentItem.updatedAt]);

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
    setEditIsPublic(isPublic);
    setEditMoodPhrase(currentItem.moodPhrase);
    setEditQuote(currentItem.quote ?? "");
    setEditDescription(currentItem.description ?? "");
    setEditExtraEmotions(currentItem.extraEmotions ?? []);
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
        extraEmotions: editExtraEmotions.length > 0 ? editExtraEmotions : null,
        visibilityIntent: editIsPublic ? "public" : "private",
        publicationStatus: "pending_second_review",
        updatedAt: new Date().toISOString(),
      }));
      setIsEditing(false);
      setEditFeedback("修改已提交，正在进行二次审核呀♪");
      return;
    }

    if (editIsPublic !== isPublic) {
      visibilityMutation.mutate({ id: currentItem.id, isPublic: editIsPublic });
    }

    editMutation.mutate({
      moodPhrase,
      quote: editQuote.trim().length > 0 ? editQuote.trim() : null,
      description: editDescription.trim(),
      extraEmotions: editExtraEmotions.length > 0 ? editExtraEmotions : undefined,
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

      <LiquidCard className="bg-white/50 dark:bg-black/30 backdrop-blur-xl border-white/60 dark:border-white/10 p-10 flex flex-col gap-8 shadow-xl hover:shadow-2xl transition-all duration-500">
        {isEditing ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-400 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> 标题
              </span>
              <input
                type="text"
                maxLength={200}
                value={editMoodPhrase}
                onChange={(e) => setEditMoodPhrase(e.target.value)}
                placeholder="嗨，今天有什么绚丽的想法，想要告诉我吗？♪"
                className="w-full bg-white/30 dark:bg-black/40 border-none rounded-2xl px-5 py-4 text-base font-bold text-slate-700 dark:text-slate-100 outline-none focus:ring-2 focus:ring-pink-200/60 shadow-inner overflow-hidden"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-400 flex items-center gap-1">
                <Quote className="w-3 h-3" style={{ transform: 'scale(-1, -1)' }} /> 今日誓言
              </span>
              <input
                type="text"
                maxLength={200}
                value={editQuote}
                onChange={(e) => setEditQuote(e.target.value)}
                placeholder="把这份无瑕的记忆交给我保管吧♪"
                className="w-full bg-white/30 dark:bg-black/40 border-none rounded-2xl px-5 py-3 text-base italic text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/60 transition-all shadow-inner"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-400 flex items-center gap-1">
                <ListChevronsUpDown className="w-3 h-3" style={{ transform: 'scale(-1, -1)' }} /> 详细描述
              </span>
              <textarea
                value={editDescription}
                maxLength={1000}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="遇到烦心事了吗？不如深呼吸，让思绪像飞花一样飘散吧~ 需不需要我给你一点小灵感呢？♪"
                className="w-full min-h-[140px] resize-none bg-white/30 dark:bg-black/40 border-none rounded-2xl px-5 py-4 text-sm text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-pink-200/50 shadow-inner"
              />
            </div>

            <div className={`flex flex-col gap-3 flex-1 w-full min-w-0`}>
              <div className="flex items-center gap-2">
                <Tag className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] tracking-widest text-slate-400 uppercase font-bold flex items-center gap-1">情绪心境</span>
              </div>
              <MoodStripSelector extraEmotions={editExtraEmotions} onToggle={(tag) => {
                const next = editExtraEmotions.includes(tag)
                  ? editExtraEmotions.filter((t) => t !== tag)
                  : editExtraEmotions.length < 8
                    ? [...editExtraEmotions, tag]
                    : editExtraEmotions;
                setEditExtraEmotions(next);
                setEditFeedback(null);
              }} />
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <NavIconButton
                  icon={<Trash2 className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" />}
                  label="删除"
                  onClick={() => alert("Delete not implemented")}
                  isActive={false}
                />
                <NavIconButton
                  icon={<X className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />}
                  label="取消"
                  onClick={handleEditCancel}
                  isActive={false}
                />
              </div>

              <AsymmetricTogglePanel
                currentState={editIsPublic ? "universe" : "mindmap"}
                onStateChange={(newState) => setEditIsPublic(newState === "universe")}
                onSubmit={handleEditSave}
                isPending={editMutation.isPending}
              />
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
                    className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 shrink-0 p-1 rounded-full text-violet-400 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-100"
                  >
                    <PenLine className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Emotions on the right of title */}
              {emotionTags.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-end pt-1 shrink-0 max-w-[200px]">
                  {emotionTags.map(e => (
                    <span key={e} className="px-3 py-1 rounded-full bg-pink-100/40 dark:bg-pink-900/10 border-2 border-pink-200/30 dark:border-pink-800/20 text-[10px] text-pink-600 dark:text-pink-300">
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
