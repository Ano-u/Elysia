import React, { useRef, useState, useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import { UniverseCard } from "./UniverseCard";
import { useUiStore } from "../../store/uiStore";
import { useQuery } from "@tanstack/react-query";
import { getUniverseViewport } from "../../lib/apiClient";

export const UniverseView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  const canvasSize = 4000;

  // Calculate initial viewport offset based on initial state
  const initialWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const initialHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const initialXOffset = -(canvasSize / 2 - initialWidth / 2);
  const initialYOffset = -(canvasSize / 2 - initialHeight / 2);

  // Create motion values to track the canvas position
  const x = useMotionValue(initialXOffset);
  const y = useMotionValue(initialYOffset);

  // Derive coordinates for API request
  const [requestCoords, setRequestCoords] = useState({ x: 0, y: 0 });

  // Debounce API requests on drag and convert canvas position to virtual universe coords.
  useEffect(() => {
    let timeoutId: number | null = null;

    const schedule = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        const latestX = x.get();
        const latestY = y.get();
        const virtualX = latestX + canvasSize / 2 - viewportSize.width / 2;
        const virtualY = latestY + canvasSize / 2 - viewportSize.height / 2;
        setRequestCoords({ x: virtualX, y: virtualY });
      }, 420);
    };

    const unsubscribeX = x.on("change", schedule);
    const unsubscribeY = y.on("change", schedule);
    schedule();

    return () => {
      unsubscribeX();
      unsubscribeY();
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [canvasSize, x, y, viewportSize.height, viewportSize.width]);

  const { data: universeData, isLoading } = useQuery({
    queryKey: ['universe', 'viewport', requestCoords.x, requestCoords.y],
    queryFn: () => {
      // Calculate virtual view width based on physical window
      const w = viewportSize.width * 2;
      const h = viewportSize.height * 2;
      // Coordinates for query top-left corner
      const reqX = Math.round(requestCoords.x - w / 2);
      const reqY = Math.round(requestCoords.y - h / 2);

      return getUniverseViewport(reqX, reqY, w, h);
    },
    staleTime: 1000 * 30, // 30s stale time
    placeholderData: (prev) => prev, // Keep old data while fetching
  });

  const cards = universeData?.items || [];
  // Use backend provided focus logic or fallback to first 3
  const focusedIds = universeData?.focus
    ? [universeData.focus.primary, ...universeData.focus.secondary].filter(Boolean)
    : [];

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update view when window resizes
  useEffect(() => {
    if (viewportSize.width && viewportSize.height) {
      // Since motion values are updated through interaction mostly,
      // we only want to ensure our drag constraints stay correct.
      // We don't reset position on every resize unless it's strictly necessary.
    }
  }, [viewportSize.width, viewportSize.height, x, y, canvasSize]);

  // Use framer-motion's drag constraints to keep the canvas in view
  const dragConstraints = {
    top: -(canvasSize - viewportSize.height),
    left: -(canvasSize - viewportSize.width),
    right: 0,
    bottom: 0,
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-transparent z-10"
      ref={containerRef}
    >
      {/* Background stars / dust effect */}
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
            <div className="font-elysia-poem text-[1.5rem] leading-none text-white/70 animate-pulse">正在聆听星海回响...</div>
         </div>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="rounded-full border border-white/40 bg-white/40 px-5 py-2 text-sm text-slate-600 backdrop-blur-md dark:border-white/15 dark:bg-white/8 dark:text-slate-200/85">
            还没有公开回响，先在 Elysia 写下一句吧。
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2">
        <div className="rounded-full border border-white/45 bg-white/45 px-4 py-1.5 text-xs tracking-[0.14em] text-slate-500 backdrop-blur-md dark:border-white/12 dark:bg-black/18 dark:text-slate-300/70">
          拖动画布漫游 · 焦点会在你附近亮起
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
        {/* Origin Marker (for debugging/visual reference) */}
        <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-blue-500/20 rounded-full -translate-x-1/2 -translate-y-1/2 blur-sm" />

        {cards.map((card, index) => {
          // Convert virtual coordinate to physical canvas coordinate
          // Virtual 0,0 is physical canvasSize/2, canvasSize/2
          const physicalX = (canvasSize / 2) + card.coord.x;
          const physicalY = (canvasSize / 2) + card.coord.y;

          let focusRank = -1;
          if (focusedIds.length > 0) {
            const idx = focusedIds.indexOf(card.id);
            focusRank = idx;
          } else {
             // Fallback to closest center distance if no focus provided
             focusRank = index < 3 ? index : -1;
          }

          // Format relative time simple string
          const rtf = new Intl.RelativeTimeFormat('zh', { numeric: 'auto' });
          const daysDifference = Math.round((new Date(card.createdAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          const timeStr = rtf.format(daysDifference, 'day');

          const content = card.quote ? `${card.moodPhrase}\n\n> ${card.quote}` : card.moodPhrase;

          return (
            <UniverseCard
              key={card.id}
              x={physicalX}
              y={physicalY}
              content={content}
              time={timeStr}
              author={card.authorName || '无名星光'}
              focusRank={focusRank}
            />
          );
        })}
      </motion.div>

      {/* Simple draggable emoji for testing interaction */}
      <div className="absolute bottom-8 right-8 z-50 flex gap-4">
        {["💖", "✨", "🌸"].map((emoji, i) => (
          <motion.div
            key={i}
            className="h-12 w-12 cursor-grab rounded-full border border-white/25 bg-white/12 text-2xl shadow-lg backdrop-blur-md flex items-center justify-center"
            drag
            dragSnapToOrigin
            whileDrag={{ scale: 1.2, zIndex: 100 }}
            onDragStart={() => {
              // Create ghost data transfer if needed, but framer-motion handles coordinates
              // We'll rely on hit detection in the card
            }}
          >
            {emoji}
          </motion.div>
        ))}
      </div>
    </div>
  );
};
