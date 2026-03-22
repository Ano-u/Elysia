import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { motion, useMotionValue } from "framer-motion";
import { UniverseCard } from "./UniverseCard";
import { ButterflyDecor } from "./ButterflyDecor";
import { EmojiDock } from "./EmojiDock";
import { useUiStore } from "../../store/uiStore";
import { useQuery } from "@tanstack/react-query";
import { getUniverseViewport } from "../../lib/apiClient";
import { StarSeaCanvas } from "./StarSeaCanvas";

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

  const cards = universeData?.items || [];

  // 布局：使用后端坐标 + 碰撞推开
  const layoutCards = useMemo(() => {
    if (cards.length === 0) return [];

    const center = canvasSize / 2;
    const cardW = 256; // w-64 = 16rem = 256px
    const cardH = 120; // 估算高度

    // 用后端坐标映射到画布
    const positions = cards.map((card) => ({
      x: center + card.coord.x,
      y: center + card.coord.y,
    }));

    // 碰撞推开
    resolveCollisions(positions, cardW, cardH);

    // 为每张卡片决定是否显示金句（随机但稳定）
    return cards.map((card, i) => {
      // 用 id 的 charCode 做伪随机，保证同一卡片每次结果一致
      const hash = card.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
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

  const handleReaction = useCallback((cardId: string, emojiType: string) => {
    // TODO: 调用 API 发送反应
    console.log(`Reaction: ${emojiType} on card ${cardId}`);
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[var(--universe-void-purple)] dark:bg-[var(--universe-deep-space)] z-10 transition-colors duration-1000"
      ref={containerRef}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_12%,rgba(147,112,219,0.34),transparent_38%),radial-gradient(circle_at_82%_10%,rgba(255,182,193,0.25),transparent_36%),radial-gradient(circle_at_50%_100%,rgba(168,216,234,0.2),transparent_46%)] animate-nebula mix-blend-screen" />
      
      {/* 晶体飞鳐与粒子层 */}
      <StarSeaCanvas />

      {/* 星尘背景 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30 dark:opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {isLoading && cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="font-elysia-poem text-[1.5rem] leading-none text-white/70 animate-pulse">正在聆听星海的回响呢...♪</div>
        </div>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="rounded-full border border-white/50 bg-white/20 px-5 py-2 text-sm text-slate-100 backdrop-blur-md shadow-[0_0_15px_rgba(255,182,193,0.3)] dark:border-white/20 dark:bg-black/35 dark:text-slate-100/90">
            星海里还很安静呀，要不要成为第一个留下奇迹的人呢？♪
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2">
        <div className="rounded-full border border-white/40 bg-white/20 px-4 py-1.5 text-xs tracking-[0.14em] text-slate-200 backdrop-blur-md shadow-[0_0_10px_rgba(255,255,255,0.2)] dark:border-white/18 dark:bg-black/35 dark:text-slate-200/80">
          拖动画布漫游 · 靠近中心的回响会如水晶般清晰哦♪
        </div>
      </div>

      <motion.div
        drag
        dragConstraints={dragConstraints}
        dragElastic={reduceMotion ? 0 : 0.1}
        dragMomentum={!reduceMotion}
        style={{ x, y, width: canvasSize, height: canvasSize }}
        className="relative cursor-grab active:cursor-grabbing touch-none"
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
            (new Date(card.createdAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const timeStr = rtf.format(daysDiff, 'day');
          const distanceRatio = getDistanceRatio(physicalX, physicalY);

          return (
            <UniverseCard
              key={card.id}
              x={physicalX}
              y={physicalY}
              title={card.moodPhrase}
              quote={card.quote}
              tags={card.tags || []}
              showQuote={showQuote}
              time={timeStr}
              author={card.authorName || '无名星光'}
              distanceRatio={distanceRatio}
              isActive={i === activeIndex}
              onReaction={(emojiType) => handleReaction(card.id, emojiType)}
            />
          );
        })}
      </motion.div>

      {/* 表情拖拽面板 */}
      <EmojiDock />
    </div>
  );
};
