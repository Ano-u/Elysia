import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { UniverseCard, getEmotionConfig, REACTION_EMOJIS } from "./UniverseCard";
import { ButterflyDecor } from "./ButterflyDecor";
import { EmojiDock } from "./EmojiDock";
import { useUiStore } from "../../store/uiStore";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getUniverseViewport, toggleReaction, createReply, getRecord, getMoodOptions } from "../../lib/apiClient";
import { validateCustomMoodTagLength } from "../../lib/moodPhraseValidation";
import { MainInputCard } from "../../components/ui/MainInputCard";
import { AsymmetricTogglePanel } from "../../components/ui/AsymmetricTogglePanel";
import { MoodStripSelector } from "../../components/ui/MoodStripSelector";
import { Tag as TagIcon, MessageCircle, CornerLeftUp, ArrowUpToLine, X } from "lucide-react";
import { StarSeaCanvas } from "./StarSeaCanvas";
import { AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: import("clsx").ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 简单碰撞推开：遍历所有卡片，如果两张卡片中心距离 < minDist，就互相推开。
 * 迭代几轮直到没有重叠。
 */
function resolveCollisions(
  positions: { x: number; y: number }[],
  cardW: number,
  cardH: number,
  iterations = 8,
) {
  const minDistX = cardW + 16; // 卡片宽 + 间距
  const minDistY = cardH + 12;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const overlapX = minDistX - Math.abs(dx);
        const overlapY = minDistY - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          // 选择推开距离更小的轴
          if (overlapX < overlapY) {
            const pushX = (overlapX / 2 + 1) * (dx >= 0 ? 1 : -1);
            positions[i].x -= pushX;
            positions[j].x += pushX;
          } else {
            const pushY = (overlapY / 2 + 1) * (dy >= 0 ? 1 : -1);
            positions[i].y -= pushY;
            positions[j].y += pushY;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return positions;
}

export const UniverseView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  const canvasSize = 4000;

  const initialWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const initialHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const initialXOffset = -(canvasSize / 2 - initialWidth / 2);
  const initialYOffset = -(canvasSize / 2 - initialHeight / 2);

  const x = useMotionValue(initialXOffset);
  const y = useMotionValue(initialYOffset);

  // 当前视口中心在画布上的坐标（实时更新）
  const [viewportCenter, setViewportCenter] = useState({ x: canvasSize / 2, y: canvasSize / 2 });

  const [requestCoords, setRequestCoords] = useState({ x: 0, y: 0 });

  // 缩放控制
  const scale = useMotionValue(1);
  const [showTooltip, setShowTooltip] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [openedCards, setOpenedCards] = useState<any[]>([]);
  // To track which card we are replying to
  const [replyingToId, setReplyingToId] = useState<string | null>(null);


  const [isReplying, setIsReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState({
    moodPhrase: "",
    moodMode: "preset" as "preset" | "other_random" | "custom",
    customMoodPhrase: "",
    extraEmotions: [] as string[],
    quote: "",
    description: "",
    visibilityIntent: "public" as "public" | "private",
  });

  const { data: moodOptions } = useQuery({
    queryKey: ['moodOptions'],
    queryFn: getMoodOptions,
    staleTime: Infinity,
  });
  const primaryTags = moodOptions?.primary || [];
  const rotatingTags = moodOptions?.rotating || [];

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createReply>[1]) => createReply(replyingToId || '', data),
    onSuccess: () => {
      setIsReplying(false);
      setReplyDraft({
        moodPhrase: "",
        moodMode: "preset",
        customMoodPhrase: "",
        extraEmotions: [],
        quote: "",
        description: "",
        visibilityIntent: "public",
      });
    }
  });

  const getCustomError = (val?: string) => {
    if (!val) return null;
    const res = validateCustomMoodTagLength(val);
    return res.ok ? null : res.reason;
  };

  const handleSaveReply = () => {
    const finalMood = replyDraft.moodPhrase.trim();
    if (!finalMood) return;

    if (replyDraft.extraEmotions.includes("custom")) {
      const customVal = replyDraft.customMoodPhrase || "";
      const customCheck = validateCustomMoodTagLength(customVal);
      if (!customCheck.ok) {
        setElysiaToast(customCheck.reason);
        return;
      }
    }

    createMutation.mutate({
      content: finalMood,
      moodMode: replyDraft.moodMode,
      customMoodPhrase: replyDraft.extraEmotions.includes("custom") ? replyDraft.customMoodPhrase : undefined,
      moodPhrase: finalMood,
      extraEmotions: replyDraft.extraEmotions.map(e => e === "custom" ? replyDraft.customMoodPhrase || "" : e).filter(Boolean),
      quote: replyDraft.quote,
      description: replyDraft.description,
      isPublic: replyDraft.visibilityIntent === "public"
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedCardRef = useRef<any[]>([]);
  useEffect(() => {
    selectedCardRef.current = openedCards;
  }, [openedCards]);


  useEffect(() => {
    const timer = setTimeout(() => setShowTooltip(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // 滑动滚轮放缩与双指捏合放缩
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (selectedCardRef.current.length > 0) return;
      // 防止触控板双指滚动变成页面滚动或前进后退
      e.preventDefault();

      const zoomSensitivity = 0.0015;
      const delta = -e.deltaY * zoomSensitivity;
      const current = scale.get();
      const next = Math.max(0.4, Math.min(2, current + delta));

      animate(scale, next, { duration: 0.1, ease: "easeOut" });
    };

    let initialDistance: number | null = null;
    let initialScale: number | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.sqrt(dx * dx + dy * dy);
        initialScale = scale.get();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistance !== null && initialScale !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const nextScale = initialScale * (distance / initialDistance);
        scale.set(Math.max(0.4, Math.min(2, nextScale)));
      }
    };

    const handleTouchEnd = () => {
      initialDistance = null;
      initialScale = null;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [scale]);

  // 监听画布拖动，更新视口中心和 API 请求坐标
  useEffect(() => {
    let timeoutId: number | null = null;
    let rafId: number | null = null;

    const updateCenter = () => {
      const latestX = x.get();
      const latestY = y.get();
      // 画布偏移 → 视口中心在画布上的位置
      const cx = -latestX + viewportSize.width / 2;
      const cy = -latestY + viewportSize.height / 2;
      setViewportCenter({ x: cx, y: cy });
    };

    const scheduleApi = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const latestX = x.get();
        const latestY = y.get();
        const virtualX = latestX + canvasSize / 2 - viewportSize.width / 2;
        const virtualY = latestY + canvasSize / 2 - viewportSize.height / 2;
        setRequestCoords({ x: virtualX, y: virtualY });
      }, 420);
    };

    const onChange = () => {
      // 用 rAF 节流视口中心更新
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updateCenter();
        rafId = null;
      });
      scheduleApi();
    };

    const unsubX = x.on("change", onChange);
    const unsubY = y.on("change", onChange);
    updateCenter();
    scheduleApi();

    return () => {
      unsubX();
      unsubY();
      if (timeoutId) window.clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [canvasSize, x, y, viewportSize.width, viewportSize.height]);

  const { data: universeData, isLoading } = useQuery({
    queryKey: ['universe', 'viewport', requestCoords.x, requestCoords.y],
    queryFn: () => {
      const w = viewportSize.width * 2;
      const h = viewportSize.height * 2;
      const reqX = Math.round(requestCoords.x - w / 2);
      const reqY = Math.round(requestCoords.y - h / 2);
      return getUniverseViewport(reqX, reqY, w, h);
    },
    staleTime: 1000 * 30,
    placeholderData: (prev) => prev,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cachedCards, setCachedCards] = useState<any[]>([]);

  useEffect(() => {
    if (!universeData?.items) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCachedCards(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newItems = universeData.items.filter(item => !existingIds.has(item.id));
      if (newItems.length === 0) return prev;
      return [...prev, ...newItems];
    });
  }, [universeData]);

  const cards = cachedCards;

  // 布局：使用后端坐标 + 情感聚类 + 碰撞推开
  const layoutCards = useMemo(() => {
    if (cards.length === 0) return [];

    const center = canvasSize / 2;
    const cardW = 256; // w-64 = 16rem = 256px
    const cardH = 120; // 估算高度

    // 用后端坐标映射到画布，并加入情感聚类偏移
    const positions = cards.map((card) => {
      let x = center + card.coord.x;
      let y = center + card.coord.y;

      // 基于情绪标签的极坐标聚类偏移，使卡片更紧凑且有联系
      const tag = card.tags?.[0] || '';

      // 用 id 生成确定性的伪随机数 (0-1)
      const hash1 = card.id.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      const hash2 = card.id.split("").reduce((acc: number, c: string, i: number) => acc + c.charCodeAt(0) * (i + 1), 0);
      const rand1 = (hash1 % 1000) / 1000;
      const rand2 = (hash2 % 1000) / 1000;
      const rand3 = ((hash1 + hash2) % 1000) / 1000;

      let clusterAngle = 0;
      let clusterRadius = 150 + rand1 * 80;

      if (['开心', '喜悦', '治愈', '感动'].includes(tag)) {
        clusterAngle = -Math.PI / 4; // 右上方
      } else if (['难过', '悲伤', '孤独', '心碎'].includes(tag)) {
        clusterAngle = (3 * Math.PI) / 4; // 左下方
      } else if (['平静', '迷茫', '思考'].includes(tag)) {
        clusterAngle = -(3 * Math.PI) / 4; // 左上方
      } else if (['生气', '焦虑', '烦躁'].includes(tag)) {
        clusterAngle = Math.PI / 4; // 右下方
      } else {
        // 默认混合在中心附近
        clusterRadius = rand2 * 100;
        clusterAngle = rand3 * Math.PI * 2;
      }

      // 添加随机角度扰动，让不同聚类相互渗透连接，避免空荡荡
      clusterAngle += (rand1 - 0.5) * 1.5;

      x += Math.cos(clusterAngle) * clusterRadius;
      y += Math.sin(clusterAngle) * clusterRadius;

      return { x, y };
    });

    // 碰撞推开，增加迭代以产生更好的连结感
    resolveCollisions(positions, cardW, cardH, 15);

    // 为每张卡片决定是否显示金句（随机但稳定）
    return cards.map((card, i) => {
      // 用 id 的 charCode 做伪随机，保证同一卡片每次结果一致
      const hash = card.id.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      const showQuote = hash % 3 !== 0; // 约 2/3 的卡片显示金句

      return {
        card,
        physicalX: positions[i].x,
        physicalY: positions[i].y,
        showQuote,
      };
    });
  }, [cards, canvasSize]);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const dragConstraints = {
    top: -(canvasSize - viewportSize.height),
    left: -(canvasSize - viewportSize.width),
    right: 0,
    bottom: 0,
  };

  // 计算卡片到视口中心的归一化距离
  const getDistanceRatio = useCallback(
    (px: number, py: number) => {
      const dx = px - viewportCenter.x;
      const dy = py - viewportCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 以视口对角线的一半作为最大距离参考
      const maxDist = Math.sqrt(
        viewportSize.width * viewportSize.width + viewportSize.height * viewportSize.height
      ) / 2;
      return Math.min(dist / maxDist, 1);
    },
    [viewportCenter.x, viewportCenter.y, viewportSize.width, viewportSize.height],
  );

  // 找出当前最靠近中心的活跃卡片
  const activeIndex = useMemo(() => {
    if (layoutCards.length === 0) return -1;
    let minIdx = 0;
    let minD = getDistanceRatio(layoutCards[0].physicalX, layoutCards[0].physicalY);
    for (let i = 1; i < layoutCards.length; i++) {
      const d = getDistanceRatio(layoutCards[i].physicalX, layoutCards[i].physicalY);
      if (d < minD) {
        minD = d;
        minIdx = i;
      }
    }
    return minIdx;
  }, [layoutCards, getDistanceRatio]);

  // 反应存储
  const [reactionsStore, setReactionsStore] = useState<Record<string, Record<string, number>>>({});
  const [, setUserReacted] = useState<Record<string, Set<string>>>({});
  const [elysiaToast, setElysiaToast] = useState<string | null>(null);

  const handleReaction = useCallback((cardId: string, emojiType: string) => {
    let success = true;
    setUserReacted(prev => {
      const cardSet = prev[cardId] || new Set();
      if (cardSet.has(emojiType)) {
        // Already reacted with this emoji
        setElysiaToast("哎呀，这份满满的心意爱莉已经确实地收到咯，同样的心绪不用重复施放魔法啦♪");
        success = false;
        return prev;
      }
      // Not reacted yet
      const newSet = new Set(cardSet);
      newSet.add(emojiType);

      setReactionsStore(rStore => {
        const currentCardReactions = rStore[cardId] || {};
        return {
          ...rStore,
          [cardId]: {
            ...currentCardReactions,
            [emojiType]: (currentCardReactions[emojiType] || 0) + 1
          }
        };
      });

      // Clear toast if it was showing
      setElysiaToast(null);

      // Call API in the background
      toggleReaction(cardId, emojiType).catch((err) => {
        console.error("Failed to save reaction", err);
      });

      return { ...prev, [cardId]: newSet };
    });

    return success;
  }, []);

  // 自动清除 Toast
  useEffect(() => {
    if (elysiaToast) {
      const timer = setTimeout(() => setElysiaToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [elysiaToast]);

  const [currentNow, setCurrentNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    const current = scale.get();
    const next = direction === 'in' ? Math.min(current + 0.2, 2) : Math.max(current - 0.2, 0.4);
    animate(scale, next, { type: "spring", stiffness: 300, damping: 30 });
  }, [scale]);

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[var(--universe-void-purple)] dark:bg-[var(--universe-deep-space)] z-10 transition-colors duration-1000"
      ref={containerRef}
    >
      {/* 梦幻水晶星云层 - 浅色模式 */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_20%,rgba(255,160,190,0.4),transparent_50%),radial-gradient(circle_at_85%_20%,rgba(210,150,230,0.35),transparent_50%),radial-gradient(circle_at_50%_85%,rgba(255,140,180,0.3),transparent_60%),radial-gradient(circle_at_25%_75%,rgba(255,220,230,0.6),transparent_50%)] animate-nebula mix-blend-normal opacity-90 dark:hidden" />

      {/* 梦幻水晶星云层 - 恢复 11:40 的暗色模式经典配置 */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(240,182,214,0.4),transparent_40%),radial-gradient(circle_at_80%_15%,rgba(200,162,232,0.3),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(255,182,193,0.35),transparent_50%)] animate-nebula mix-blend-screen hidden dark:block" />

      {/* 柔和的环境辉光叠加（仅浅色模式下增加梦幻朦胧感） */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/50 via-transparent to-pink-100/40 dark:hidden mix-blend-overlay" />

      {/* 晶体飞鳐与粒子层 */}
      <StarSeaCanvas />

      {/* 星尘背景 - 浅色模式为粉紫色晶尘，深色模式恢复为 11:40 的纯白星光 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-50 dark:hidden"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,160,190,0.3) 1.5px, transparent 1.5px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute inset-0 hidden dark:block opacity-30 dark:opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {isLoading && cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="font-elysia-poem text-[1.5rem] leading-none text-pink-400/80 dark:text-white/70 animate-pulse">正在聆听星海的回响呢...♪</div>
        </div>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="rounded-full border border-pink-200/60 bg-white/60 px-5 py-2 text-sm text-pink-700/80 backdrop-blur-md shadow-[0_4px_20px_rgba(255,182,193,0.4)] dark:border-white/20 dark:bg-black/35 dark:text-slate-100/90 dark:shadow-[0_0_15px_rgba(255,182,193,0.1)]">
            星海里还很安静呀，要不要成为第一个留下奇迹的人呢？♪
          </div>
        </div>
      )}

      <motion.div
        className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: showTooltip ? 1 : 0, y: showTooltip ? 0 : -10 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      >
        <div className="rounded-full border border-pink-200/60 bg-white/70 px-4 py-1.5 text-xs tracking-[0.14em] text-pink-700/80 backdrop-blur-md shadow-[0_4px_20px_rgba(255,182,193,0.5)] dark:border-white/18 dark:bg-black/35 dark:text-slate-200/80 dark:shadow-[0_0_10px_rgba(255,255,255,0.2)]">
          拖动画布漫游 · 靠近中心的回响会如水晶般清晰哦♪
        </div>
      </motion.div>

      {/* 爱莉希雅专属 Toast */}
      <AnimatePresence>
        {elysiaToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-24 left-1/2 z-[150] whitespace-nowrap px-6 py-3 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-pink-200 dark:border-pink-800 shadow-[0_10px_30px_rgba(255,182,193,0.3)] flex items-center gap-3"
          >
            <span className="text-xl">🌸</span>
            <span className="text-sm font-elysia-display text-pink-700/90 dark:text-slate-200 tracking-wide">
              {elysiaToast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        drag
        dragConstraints={dragConstraints}
        dragElastic={reduceMotion ? 0 : 0.1}
        dragMomentum={!reduceMotion}
        style={{ x, y, scale, width: canvasSize, height: canvasSize }}
        className="relative cursor-grab active:cursor-grabbing touch-none z-[5]"
      >
        {/* 蝴蝶装饰 */}
        <ButterflyDecor />

        {/* 背景花瓣飘落 */}
        {!reduceMotion && (
          <div className="absolute inset-0 pointer-events-none z-[0] overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={`petal-${i}`}
                className="absolute animate-petal-float"
                style={{
                  left: `${10 + (i * 8.5) % 80}%`,
                  top: "-20px",
                  width: `${6 + (i % 3) * 2}px`,
                  height: `${8 + (i % 4) * 2}px`,
                  borderRadius: "50% 0 50% 50%",
                  background: `linear-gradient(135deg, var(--elysia-butterfly), var(--elysia-crystal))`,
                  opacity: 0.08 + (i % 4) * 0.02,
                  animationDelay: `${i * -2.3}s`,
                  animationDuration: `${18 + (i % 5) * 3}s`,
                  transform: `rotate(${i * 36}deg)`,
                }}
              />
            ))}
          </div>
        )}

        {/* 焦点卡片的大范围照亮光晕 */}
        {activeIndex >= 0 && layoutCards[activeIndex] && !reduceMotion && (
          <motion.div
            className="absolute pointer-events-none rounded-full z-[5]"
            animate={{
              x: layoutCards[activeIndex].physicalX - 400,
              y: layoutCards[activeIndex].physicalY - 400,
            }}
            transition={{ type: "spring", damping: 30, stiffness: 80 }}
            style={{
              width: 800,
              height: 800,
              background: "radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(255,182,193,0.08) 30%, transparent 65%)",
              mixBlendMode: "overlay"
            }}
          />
        )}

        {/* 内容卡片 */}
        {layoutCards.map(({ card, physicalX, physicalY, showQuote }, i) => {
          const rtf = new Intl.RelativeTimeFormat('zh', { numeric: 'auto' });
          const daysDiff = Math.round(
            (new Date(card.createdAt).getTime() - currentNow) / (1000 * 60 * 60 * 24)
          );
          const timeStr = rtf.format(daysDiff, 'day');
          const distanceRatio = getDistanceRatio(physicalX, physicalY);

          const cardReactions = { ...reactionsStore[card.id] };
          const bHearts = Number(card.hearts || 0);
          const bHugs = Number(card.hugs || 0);
          const bStars = Number(card.stars || 0);
          const bButterflies = Number(card.butterflies || 0);
          const bFlowers = Number(card.flowers || 0);

          if (bHearts > 0 && !cardReactions.heart) cardReactions.heart = bHearts;
          else if (bHearts > 0) cardReactions.heart += bHearts;

          if (bHugs > 0 && !cardReactions.hug) cardReactions.hug = bHugs;
          else if (bHugs > 0) cardReactions.hug += bHugs;

          if (bStars > 0 && !cardReactions.star) cardReactions.star = bStars;
          else if (bStars > 0) cardReactions.star += bStars;

          if (bButterflies > 0 && !cardReactions.butterfly) cardReactions.butterfly = bButterflies;
          else if (bButterflies > 0) cardReactions.butterfly += bButterflies;

          if (bFlowers > 0 && !cardReactions.flower) cardReactions.flower = bFlowers;
          else if (bFlowers > 0) cardReactions.flower += bFlowers;

          return (
            <UniverseCard
              key={card.id}
              x={physicalX}
              y={physicalY}
              title={card.moodPhrase}
              quote={card.quote}
              tags={card.extraEmotions?.length ? card.extraEmotions : (card.tags || [])}
              showQuote={showQuote}
              time={timeStr}
              author={card.authorName || '无名星光'}
              distanceRatio={distanceRatio}
              isActive={i === activeIndex}
              reactions={cardReactions}
              onReaction={(emojiType) => handleReaction(card.id, emojiType)}
              onClick={() => setOpenedCards([card])}
            />
          );
        })}
      </motion.div>

      {/* 缩放控制面板 */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        <button
          onClick={() => handleZoom('in')}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/20 dark:bg-black/30 backdrop-blur-md border border-white/40 dark:border-white/10 text-slate-700 dark:text-slate-200 shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:bg-white/40 dark:hover:bg-black/50 transition-colors"
          aria-label="Zoom In"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button
          onClick={() => handleZoom('out')}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/20 dark:bg-black/30 backdrop-blur-md border border-white/40 dark:border-white/10 text-slate-700 dark:text-slate-200 shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:bg-white/40 dark:hover:bg-black/50 transition-colors"
          aria-label="Zoom Out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>

      {/* 表情拖拽面板 */}
      <EmojiDock />

      {/* 详细查看的弹窗 (Expanded Detail View) */}
      <AnimatePresence>
        {openedCards.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm overflow-x-auto hide-scrollbar"
            onClick={() => { setOpenedCards([]); setIsReplying(false); setReplyingToId(null); }}
          >
            <div className="flex gap-6 items-stretch h-[85vh] min-h-[500px] w-max mx-auto px-10" onClick={(e) => e.stopPropagation()}>
            {openedCards.map((selectedCard, index) => (
            <motion.div
              key={selectedCard.id || index}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-[500px] flex-shrink-0 flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative">
              {/* 装饰性背景光晕 */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-pink-300/30 rounded-full blur-3xl mix-blend-screen pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-300/30 rounded-full blur-3xl mix-blend-screen pointer-events-none" />

              {/* Header Info */}
              <div className="flex flex-wrap items-center gap-2 mb-6 relative z-10">
                {(selectedCard.extraEmotions?.length ? selectedCard.extraEmotions : (selectedCard.tags || [])).map((tag: string, idx: number) => {
                  const config = getEmotionConfig(tag);
                  return (
                    <span
                      key={idx}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border shadow-sm",
                        config.bgClass,
                        config.textClass,
                        config.borderClass
                      )}
                    >
                      <span>{config.icon}</span>
                      {tag}
                    </span>
                  );
                })}

                {/* 反应标签 */}
                {(() => {
                  const cardReactions = { ...reactionsStore[selectedCard.id] };
                  const bHearts = Number(selectedCard.hearts || 0);
                  const bHugs = Number(selectedCard.hugs || 0);
                  const bStars = Number(selectedCard.stars || 0);
                  const bButterflies = Number(selectedCard.butterflies || 0);
                  const bFlowers = Number(selectedCard.flowers || 0);

                  if (bHearts > 0 && !cardReactions.heart) cardReactions.heart = bHearts;
                  else if (bHearts > 0) cardReactions.heart += bHearts;

                  if (bHugs > 0 && !cardReactions.hug) cardReactions.hug = bHugs;
                  else if (bHugs > 0) cardReactions.hug += bHugs;

                  if (bStars > 0 && !cardReactions.star) cardReactions.star = bStars;
                  else if (bStars > 0) cardReactions.star += bStars;

                  if (bButterflies > 0 && !cardReactions.butterfly) cardReactions.butterfly = bButterflies;
                  else if (bButterflies > 0) cardReactions.butterfly += bButterflies;

                  if (bFlowers > 0 && !cardReactions.flower) cardReactions.flower = bFlowers;
                  else if (bFlowers > 0) cardReactions.flower += bFlowers;

                  if (Object.keys(cardReactions).length === 0) return null;

                  return (
                    <div className="flex items-center gap-1.5 ml-2 border-l border-white/20 pl-2">
                      {Object.entries(cardReactions).map(([emojiType, count]) => (
                        <div key={emojiType} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/40 dark:bg-black/30 text-xs text-slate-600 dark:text-slate-300 font-medium shadow-sm">
                          <span>{REACTION_EMOJIS[emojiType] || "✨"}</span>
                          <span>{count as number}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <span className="ml-auto text-sm text-slate-500 dark:text-slate-400 font-medium">
                  {new Date(selectedCard.createdAt).toLocaleString('zh-CN', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>

              {/* Main Content */}
              <div className="space-y-6 relative z-10">
                <div>
                  <p className="text-[10px] tracking-widest text-pink-500/80 dark:text-pink-400/80 font-bold mb-1.5 uppercase">Mood Phrase</p>
                  <h2 className="font-elysia-display text-2xl font-bold leading-relaxed text-slate-800 dark:text-slate-100">
                    {selectedCard.moodPhrase}
                  </h2>
                </div>

                {selectedCard.quote && (
                  <div>
                    <p className="text-[10px] tracking-widest text-purple-500/80 dark:text-purple-400/80 font-bold mb-1.5 uppercase">Quote</p>
                    <p className="text-lg text-slate-600 dark:text-slate-300 italic font-serif relative whitespace-pre-wrap break-words">
                      <span className="absolute -left-4 -top-2 text-3xl text-purple-300/50 dark:text-purple-700/50">"</span>
                      {selectedCard.quote}
                      <span className="text-3xl text-purple-300/50 dark:text-purple-700/50 -translate-y-2 inline-block ml-1">"</span>
                    </p>
                  </div>
                )}

                {selectedCard.description && (
                  <div>
                    <p className="text-[10px] tracking-widest text-blue-500/80 dark:text-blue-400/80 font-bold mb-1.5 uppercase">Story</p>
                    <div className="max-h-[30vh] overflow-y-auto hide-scrollbar pr-2">
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-white/50 dark:border-white/5 whitespace-pre-wrap break-words">
                        {selectedCard.description}
                      </p>
                    </div>
                  </div>
                )}

                {selectedCard.occurredAt && (
                  <div>
                    <p className="text-[10px] tracking-widest text-orange-500/80 dark:text-orange-400/80 font-bold mb-1.5 uppercase">Occurred At</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {selectedCard.occurredAt}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer Author */}
              <div className="mt-auto pt-4 border-t border-slate-200/60 dark:border-slate-700/50 flex justify-between items-center relative z-10">
                <div
                  className="group flex items-center gap-2 relative cursor-pointer"
                  onClick={() => {
                    const isCurrentReplying = isReplying && replyingToId === selectedCard.id;
                    setIsReplying(!isCurrentReplying);
                    setReplyingToId(!isCurrentReplying ? selectedCard.id : null);
                  }}
                >
                  <div className="flex items-center gap-2 transition-opacity duration-300 group-hover:opacity-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-400 to-purple-400 flex items-center justify-center text-white font-bold shadow-md">
                      {(selectedCard.authorName || '无')[0]}
                    </div>
                    <span className="font-elysia-display text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {selectedCard.authorName || '无名星光'}
                    </span>
                  </div>

                  <div className="absolute inset-0 flex items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 text-sm font-medium shadow-sm">
                      <MessageCircle className="w-4 h-4" />
                      {(isReplying && replyingToId === selectedCard.id) ? "收起面板" : "添加评论"}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* 查看父帖图标 */}
                  {selectedCard.replyContext?.showParentArrow && selectedCard.replyContext?.parentRecordId && !openedCards.find(c => c.id === selectedCard.replyContext?.parentRecordId) && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await getRecord(selectedCard.replyContext.parentRecordId);
                          if (res.record) {
                            const newCard = {
                              ...res.record,
                              authorName: res.author.displayName,
                              authorAvatar: res.author.avatarUrl,
                              tags: res.tags,
                              extraEmotions: res.extraEmotions,
                              quote: res.quote,
                              replyContext: res.replyContext
                            };
                            setOpenedCards(prev => [...prev, newCard]);
                          }
                        } catch (e) {
                          console.error("Failed to fetch parent record", e);
                        }
                      }}
                      className="w-8 h-8 rounded-full bg-white/50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-500 transition-colors"
                      title="查看所回复的心声"
                    >
                      <CornerLeftUp className="w-4 h-4" />
                    </button>
                  )}

                  {/* 查看主帖图标 */}
                  {selectedCard.replyContext?.showRootArrow && selectedCard.replyContext?.rootRecordId && selectedCard.replyContext?.rootRecordId !== selectedCard.replyContext?.parentRecordId && !openedCards.find(c => c.id === selectedCard.replyContext?.rootRecordId) && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await getRecord(selectedCard.replyContext.rootRecordId);
                          if (res.record) {
                            const newCard = {
                              ...res.record,
                              authorName: res.author.displayName,
                              authorAvatar: res.author.avatarUrl,
                              tags: res.tags,
                              extraEmotions: res.extraEmotions,
                              quote: res.quote,
                              replyContext: res.replyContext
                            };
                            setOpenedCards(prev => [...prev, newCard]);
                          }
                        } catch (e) {
                          console.error("Failed to fetch root record", e);
                        }
                      }}
                      className="w-8 h-8 rounded-full bg-white/50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-500 transition-colors"
                      title="查看源头心声"
                    >
                      <ArrowUpToLine className="w-4 h-4" />
                    </button>
                  )}

                  {index === openedCards.length - 1 && (
                    <button
                      onClick={() => { setOpenedCards([]); setIsReplying(false); setReplyingToId(null); }}
                      className="w-8 h-8 rounded-full bg-slate-900/10 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              </div>
            </motion.div>
            ))}

            {/* Right Side: The Reply Panel */}
            <AnimatePresence>
              {isReplying && (
                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 600, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="h-full flex-shrink-0 flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl relative overflow-hidden"
                  style={{ transform: "translateZ(0)" }}
                >
                  <div className="w-[600px] h-full p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 font-elysia-display flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-pink-500" />
                        回应这份心意
                      </h3>

                      <div className="flex flex-col gap-3 mb-6">
                        <div className="flex items-center gap-2">
                          <TagIcon className="w-4 h-4 text-slate-400" />
                          <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-black">情绪心境</span>
                        </div>
                        <MoodStripSelector
                          items={[...primaryTags, ...rotatingTags, "custom"]}
                          rotatingItems={rotatingTags}
                          selectedItems={replyDraft.extraEmotions}
                          customMoodPhrase={replyDraft.customMoodPhrase}
                          customMoodError={replyDraft.extraEmotions.includes("custom") ? getCustomError(replyDraft.customMoodPhrase) : null}
                          onCustomMoodPhraseChange={(val) => {
                            setReplyDraft({ ...replyDraft, customMoodPhrase: val });
                          }}
                          onToggle={(tag) => {
                            if (replyDraft.extraEmotions.includes(tag)) {
                              setReplyDraft({
                                ...replyDraft,
                                extraEmotions: replyDraft.extraEmotions.filter(e => e !== tag),
                                customMoodPhrase: tag === "custom" ? "" : replyDraft.customMoodPhrase
                              });
                            } else {
                              if (replyDraft.extraEmotions.length >= 2) return;
                              const newMode = tag === "custom" ? "custom" : rotatingTags.includes(tag) ? "other_random" : "preset";
                              setReplyDraft({
                                ...replyDraft,
                                extraEmotions: [...replyDraft.extraEmotions, tag],
                                moodMode: replyDraft.extraEmotions.includes("custom") || tag === "custom" ? "custom" : newMode
                              });
                            }
                          }}
                        />
                      </div>

                      <motion.div className="flex-1 w-full relative z-10 px-0 mb-6">
                        <MainInputCard
                          moodPhrase={replyDraft.moodPhrase}
                          setMoodPhrase={(v) => {
                            setReplyDraft({ ...replyDraft, moodPhrase: v });
                          }}
                          quote={replyDraft.quote}
                          setQuote={(v) => setReplyDraft({ ...replyDraft, quote: v })}
                          description={replyDraft.description}
                          setDescription={(v) => setReplyDraft({ ...replyDraft, description: v })}
                          isPending={createMutation.isPending}
                        />
                      </motion.div>

                      <div className="mt-6 flex flex-col gap-8 flex-1 justify-end pb-2">
                        <div className="flex justify-end mt-4">
                          <AsymmetricTogglePanel
                            currentState={replyDraft.visibilityIntent === "public" ? "universe" : "mindmap"}
                            onStateChange={(state) => {
                              setReplyDraft({ ...replyDraft, visibilityIntent: state === "universe" ? "public" : "private" });
                            }}
                            onSubmit={handleSaveReply}
                            isPending={createMutation.isPending}
                            canSend={replyDraft.moodPhrase.trim().length > 0}
                          />
                        </div>
                      </div>
                    </div>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
