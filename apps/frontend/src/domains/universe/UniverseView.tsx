import React, { useRef, useState, useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import { UniverseCard } from "./UniverseCard";
import { useUiStore } from "../../store/uiStore";

// Mock data generator for cards
const generateCards = (num: number, canvasSize: number) => {
  const cards = [];
  const padding = 200; // Keep away from edges
  const minDistance = 300; // Minimum distance between cards

  // A simple grid-based generator to ensure spread and avoid excessive overlaps
  const cols = Math.floor((canvasSize - padding * 2) / minDistance);
  const rows = Math.floor((canvasSize - padding * 2) / minDistance);
  const gridSize = Math.min(cols, rows);

  let count = 0;
  for (let i = 0; i < gridSize && count < num; i++) {
    for (let j = 0; j < gridSize && count < num; j++) {
      // Add random offset within the grid cell
      const xOffset = (Math.random() - 0.5) * (minDistance * 0.8);
      const yOffset = (Math.random() - 0.5) * (minDistance * 0.8);

      const x = padding + i * minDistance + minDistance / 2 + xOffset;
      const y = padding + j * minDistance + minDistance / 2 + yOffset;

      cards.push({
        id: `card-${count}`,
        x,
        y,
        content: `这是第 ${count + 1} 个在星海中漫游的灵魂记录。在这片浩瀚的二维空间里，我们彼此保持距离，却又互相感应。`,
        time: `${Math.floor(Math.random() * 24)}小时前`,
        author: `@User${Math.floor(Math.random() * 1000)}`,
      });
      count++;
    }
  }

  // If we need more cards, randomly place them
  while (count < num) {
    cards.push({
      id: `card-${count}`,
      x: padding + Math.random() * (canvasSize - padding * 2),
      y: padding + Math.random() * (canvasSize - padding * 2),
      content: `额外的灵魂碎片 ${count + 1}。`,
      time: "刚刚",
      author: `@User${Math.floor(Math.random() * 1000)}`,
    });
    count++;
  }

  return cards;
};

export const UniverseView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  const canvasSize = 4000;

  // Create motion values to track the canvas position
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const [cards] = useState(() => generateCards(40, canvasSize));

  // Store active card indices based on distance
  const [focusIndices, setFocusIndices] = useState<number[]>([]);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Center the view initially
  useEffect(() => {
    if (viewportSize.width && viewportSize.height) {
      // Offset so the center of the canvas is in the center of the screen
      const initialX = -(canvasSize / 2 - viewportSize.width / 2);
      const initialY = -(canvasSize / 2 - viewportSize.height / 2);
      x.set(initialX);
      y.set(initialY);
    }
  }, [viewportSize.width, viewportSize.height, x, y, canvasSize]);

  // Calculate distances and update focus
  useEffect(() => {
    let isMounted = true;
    let frameId: number;

    const calculateDistances = () => {
      if (!isMounted) return;

      const cx = x.get();
      const cy = y.get();

      // Canvas center in viewport
      const centerCanvasX = -cx + viewportSize.width / 2;
      const centerCanvasY = -cy + viewportSize.height / 2;

      // Calculate distance for all cards
      const distances = cards.map((card, index) => {
        const dx = card.x - centerCanvasX;
        const dy = card.y - centerCanvasY;
        return { index, distance: Math.sqrt(dx * dx + dy * dy) };
      });

      // Sort by distance and get top 3 closest (1 primary, 2 secondary)
      distances.sort((a, b) => a.distance - b.distance);
      const topIndices = distances.slice(0, 3).map((d) => d.index);

      setFocusIndices((prev) => {
        if (prev.length === topIndices.length && prev.every((v, i) => v === topIndices[i])) return prev;
        return topIndices;
      });
    };

    const updateLoop = () => {
      calculateDistances();
      frameId = requestAnimationFrame(updateLoop);
    };

    // Start tracking
    frameId = requestAnimationFrame(updateLoop);

    return () => {
      isMounted = false;
      cancelAnimationFrame(frameId);
    };
  }, [x, y, viewportSize, cards]);

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
          // Determine focus state: 0 = primary, 1/2 = secondary, -1 = far
          const focusRank = focusIndices.indexOf(index);

          return (
            <UniverseCard
              key={card.id}
              x={card.x}
              y={card.y}
              content={card.content}
              time={card.time}
              author={card.author}
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
            className="w-12 h-12 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-full text-2xl cursor-grab shadow-lg border border-white/20"
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
