import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import * as d3Zoom from "d3-zoom";
import * as d3Selection from "d3-selection";
import { useUiStore } from "../../store/uiStore";
import { getMindMapMe } from "../../lib/apiClient";
import type { MindMapNode, MindMapEdge } from "../../types/api";
import { MindMapDetailModal } from "./MindMapDetailModal";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type PositionedNode = MindMapNode & { x: number; y: number };
type PositionedEdge = MindMapEdge & { sourceNode: PositionedNode; targetNode: PositionedNode };

export const MindMapView: React.FC = () => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  const [mode, setMode] = useState<'simple' | 'deep'>(() => {
    return (localStorage.getItem('elysia-mindmap-mode') as 'simple' | 'deep') || 'simple';
  });

  useEffect(() => {
    localStorage.setItem('elysia-mindmap-mode', mode);
  }, [mode]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mindmap', 'me', mode],
    queryFn: () => getMindMapMe(mode),
    staleTime: 1000 * 60, // 1 min
  });

  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [edges, setEdges] = useState<PositionedEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);

  // Zoom & Pan DOM ref for performance
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize Zoom behavior
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const zoom = d3Zoom.zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        if (canvasRef.current) {
          canvasRef.current.style.transform = `translate(${event.transform.x}px, ${event.transform.y}px) scale(${event.transform.k})`;
        }
      });

    const selection = d3Selection.select(containerRef.current);
    selection.call(zoom);

    // Initial center position
    const initialX = window.innerWidth / 2;
    const initialY = window.innerHeight / 2;
    selection.call(zoom.transform, d3Zoom.zoomIdentity.translate(initialX, initialY).scale(1));
  }, []);

  // Calculate Fermat's Spiral Layout
  useEffect(() => {
    if (!data || !data.nodes || !data.edges) return;

    const positionedNodes = new Map<string, PositionedNode>();
    
    // Sort nodes: newest first for center of the spiral
    const sortedNodes = [...data.nodes].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA; // descending
    });

    const GOLDEN_ANGLE = 137.50776405 * (Math.PI / 180);
    const c = 160; // Distance between spiral turns

    let spiralIndex = 0;

    // First Pass: Main Spiral for non-self-replies
    sortedNodes.forEach(node => {
      if (node.isSelfReply) return; 
      
      const theta = spiralIndex * GOLDEN_ANGLE;
      const r = c * Math.sqrt(spiralIndex);
      
      positionedNodes.set(node.id, {
        ...node,
        x: r * Math.cos(theta),
        y: r * Math.sin(theta)
      });
      spiralIndex++;
    });

    // Second Pass: Clusters for self-replies (vines around parent)
    sortedNodes.forEach(node => {
      if (!node.isSelfReply) return;
      
      let parentId: string | null = null;
      if (node.replyContext?.parentRecordId) {
        const parent = sortedNodes.find(n => n.recordId === node.replyContext!.parentRecordId);
        if (parent) parentId = parent.id;
      } else {
        const edge = data.edges.find(e => e.source === node.id && e.type === 'self_reply');
        if (edge) parentId = edge.target;
      }
      
      const pNode = parentId ? positionedNodes.get(parentId) : null;
      
      if (pNode) {
        // Place in a small orbit around parent
        const clusterCount = Array.from(positionedNodes.values()).filter(n => 
          n.isSelfReply && n.replyContext?.parentRecordId === pNode.recordId
        ).length;
        
        const angle = clusterCount * (Math.PI / 3); // 60 degrees apart
        const radius = 110; // Cluster radius
        positionedNodes.set(node.id, {
          ...node,
          x: pNode.x + radius * Math.cos(angle),
          y: pNode.y + radius * Math.sin(angle)
        });
      } else {
        // Fallback to spiral if parent not found
        const theta = spiralIndex * GOLDEN_ANGLE;
        const r = c * Math.sqrt(spiralIndex);
        positionedNodes.set(node.id, {
          ...node,
          x: r * Math.cos(theta),
          y: r * Math.sin(theta)
        });
        spiralIndex++;
      }
    });

    const finalEdges = data.edges.map(e => ({
      ...e,
      sourceNode: positionedNodes.get(e.source)!,
      targetNode: positionedNodes.get(e.target)!
    })).filter(e => e.sourceNode && e.targetNode);

    setNodes(Array.from(positionedNodes.values()));
    setEdges(finalEdges);

  }, [data]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const showStarSeaGhost = selectedNode && selectedNode.replyContext?.parentTarget && !selectedNode.isSelfReply;

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/20 dark:bg-slate-950/45">
        <div className="font-elysia-poem text-[1.5rem] leading-none text-slate-600 dark:text-slate-200/90 animate-pulse">正在为您寻找失落的记忆刻印呢...♪</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/20 dark:bg-slate-950/45">
        <div className="rounded-full border border-rose-200/70 bg-white/75 px-5 py-2 text-sm text-rose-500 backdrop-blur-md dark:border-rose-400/35 dark:bg-black/40 dark:text-rose-200">
          哎呀，织网的丝线断开了，要稍等一下哦♪
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950/20 dark:bg-slate-950/45 z-10 select-none cursor-grab active:cursor-grabbing touch-none" ref={containerRef}>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_14%_12%,rgba(255,255,255,0.34),transparent_38%),radial-gradient(circle_at_86%_8%,rgba(251,191,36,0.16),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(244,114,182,0.14),transparent_45%)]" />
      
      {/* Background Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-28 dark:opacity-30 mix-blend-overlay"
        style={{
          backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }}
      />

      {/* Mode Switcher */}
      <div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-white/50 bg-white/72 px-4 py-1 text-[11px] tracking-[0.14em] text-slate-600 backdrop-blur-md dark:border-white/15 dark:bg-black/35 dark:text-slate-200/80">
        真我之环：滑动与缩放探索星海回响
      </div>

      <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-1 bg-white/72 dark:bg-black/35 backdrop-blur-md rounded-full border border-white/50 dark:border-white/15">
         <button
           onClick={() => setMode('simple')}
           className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${mode === 'simple' ? 'bg-white/90 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
         >
            近期
         </button>
         <button
           onClick={() => setMode('deep')}
           className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${mode === 'deep' ? 'bg-white/90 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
         >
            完整花环
         </button>
      </div>

      {/* Infinite Canvas Container */}
      <div
        ref={canvasRef}
        className="absolute inset-0 origin-top-left"
        style={{ transform: `translate(${window.innerWidth / 2}px, ${window.innerHeight / 2}px) scale(1)` }}
      >
        {/* SVG Edges */}
        <svg className="absolute overflow-visible w-full h-full pointer-events-none">
          <defs>
            <linearGradient id="silk-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--elysia-gold)" stopOpacity="0.5" />
              <stop offset="50%" stopColor="var(--elysia-butterfly)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--elysia-gold)" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="vine-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--elysia-coral)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--elysia-butterfly)" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Central Flower Base (0,0 point) */}
          <g opacity="0.15">
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <ellipse
                key={`flower-${angle}`}
                cx={0}
                cy={-40}
                rx={18}
                ry={45}
                fill="var(--elysia-crystal)"
                transform={`rotate(${angle})`}
              />
            ))}
            <circle r={12} fill="var(--elysia-butterfly)" opacity="0.5" />
          </g>

          {/* Edges */}
          {edges.map((link, i) => {
            const isHighlighted = selectedNodeId && (link.sourceNode.id === selectedNodeId || link.targetNode.id === selectedNodeId);
            const isSelfReply = link.type === 'self_reply' || link.sourceNode.isSelfReply;
            const isDimmed = selectedNodeId !== null && !isHighlighted;

            // Bezier Curve through the center for theme links, direct curve for self-replies
            const d = isSelfReply
              ? `M ${link.sourceNode.x},${link.sourceNode.y} Q ${(link.sourceNode.x + link.targetNode.x)/2 + 20},${(link.sourceNode.y + link.targetNode.y)/2 - 20} ${link.targetNode.x},${link.targetNode.y}`
              : `M ${link.sourceNode.x},${link.sourceNode.y} Q 0,0 ${link.targetNode.x},${link.targetNode.y}`;

            return (
              <g key={`link-${i}`} style={{ opacity: isDimmed ? 0.1 : 1, transition: 'opacity 0.5s' }}>
                {isHighlighted && (
                  <path
                    d={d}
                    stroke="var(--elysia-lavender)"
                    strokeWidth="6"
                    fill="none"
                    opacity="0.15"
                    strokeLinecap="round"
                  />
                )}
                <path
                  d={d}
                  stroke={isSelfReply ? "url(#vine-gradient)" : "url(#silk-gradient)"}
                  strokeWidth={isHighlighted ? 2.5 : (isSelfReply ? 2 : 1)}
                  fill="none"
                  opacity={isHighlighted ? 0.8 : (isSelfReply ? 0.6 : 0.3)}
                  strokeLinecap="round"
                  strokeDasharray={isSelfReply ? "none" : "6 8"}
                  className={reduceMotion || isSelfReply ? "" : "animate-silk-flow"}
                />
              </g>
            );
          })}

          {/* Line to Ghost Star Sea Node */}
          {showStarSeaGhost && selectedNode && (
            <path
              d={`M ${selectedNode.x},${selectedNode.y} Q ${selectedNode.x + 80},${selectedNode.y - 80} ${selectedNode.x + 180},${selectedNode.y - 100}`}
              stroke="var(--elysia-gold)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="4 6"
              className="animate-pulse"
            />
          )}
        </svg>

        {/* Nodes Layer */}
        <AnimatePresence>
          {nodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isRelated = edges.some(l => 
              (l.sourceNode.id === selectedNodeId && l.targetNode.id === node.id) ||
              (l.targetNode.id === selectedNodeId && l.sourceNode.id === node.id)
            );
            const isDimmed = selectedNodeId !== null && !isSelected && !isRelated;

            const nodeWidth = 160;
            const nodeHeight = 110;
            const shapeProps = {
              bg: node.isSelfReply ? 'var(--elysia-lavender)' : 'var(--elysia-butterfly)',
              border: 'var(--elysia-coral)',
              glow: 'var(--elysia-petal)',
            };

            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: isDimmed ? 0.15 : 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.6, ease: "easeOut" }}
                className="absolute flex items-center justify-center p-4 cursor-pointer transition-opacity"
                style={{
                  left: node.x,
                  top: node.y,
                  width: nodeWidth,
                  height: nodeHeight,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(isSelected ? null : node.id);
                }}
                onDoubleClick={() => {
                  if (node.recordId) setDetailRecordId(node.recordId);
                }}
                whileHover={{ scale: 1.05 }}
              >
                {/* 焦点光晕 */}
                {(node.isFocus || isSelected) && (
                  <div
                    className="absolute -inset-4 pointer-events-none rounded-3xl -z-10"
                    style={{
                      background: `radial-gradient(ellipse at center, ${shapeProps.glow} 0%, transparent 70%)`,
                      boxShadow: `0 0 30px 5px ${shapeProps.glow}`,
                    }}
                  />
                )}

                {/* 玻璃卡片主体 */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-[1.5rem]",
                    reduceMotion ? "bg-white/80 dark:bg-slate-800/80" : "bg-white/40 dark:bg-[#1a1a1e]/50 backdrop-blur-xl saturate-[1.2]",
                    "border border-white/50 dark:border-white/10",
                    isSelected ? "shadow-[0_10px_30px_var(--elysia-petal)]" : "shadow-[0_8px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
                  )}
                />

                {/* 水晶花底纹 (Crystal Flower motif) */}
                <div 
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-[1.5rem] mix-blend-overlay opacity-50"
                  style={{
                    background: `radial-gradient(circle at top right, ${shapeProps.bg} 0%, transparent 60%), radial-gradient(circle at bottom left, ${shapeProps.bg} 0%, transparent 60%)`
                  }}
                />

                {/* 玻璃反射 */}
                <div className="absolute inset-0 rounded-[1.5rem] pointer-events-none ring-1 ring-inset ring-white/30 mix-blend-overlay z-10" />
                <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none opacity-60 z-10" />

                {/* Label */}
                <div className="relative z-20 flex flex-col h-full w-full justify-center">
                  <span className="text-[11px] sm:text-xs font-semibold leading-snug line-clamp-3 text-slate-800 dark:text-slate-100 break-words drop-shadow-sm pointer-events-none text-center">
                    {node.label}
                  </span>
                </div>

                {/* Selection Ring */}
                {isSelected && (
                  <motion.div
                    className="absolute -inset-1 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      border: `1.5px solid var(--elysia-gold)`,
                      borderRadius: '1.75rem',
                    }}
                  />
                )}
                
                {/* Click Hint for Details */}
                {isSelected && (
                  <div className="absolute -bottom-8 whitespace-nowrap text-[10px] text-pink-400 bg-white/60 dark:bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
                    双击查看水晶残像
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Star Sea Ghost Node (Blur to Clear) */}
          {showStarSeaGhost && selectedNode && selectedNode.replyContext?.parentTarget && (
            <motion.div
              key={`ghost-${selectedNode.id}`}
              initial={{ filter: 'blur(20px)', opacity: 0, scale: 0.8, x: selectedNode.x + 180, y: selectedNode.y - 100 }}
              animate={{ filter: 'blur(0px)', opacity: 1, scale: 1, x: selectedNode.x + 180, y: selectedNode.y - 100 }}
              exit={{ filter: 'blur(20px)', opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="absolute w-48 h-auto p-4 rounded-xl border border-pink-200/50 bg-white/40 dark:bg-black/40 backdrop-blur-md shadow-[0_0_15px_rgba(255,192,203,0.3)] flex flex-col gap-2"
              style={{ transform: 'translate(-50%, -50%)' }}
            >
              <div className="text-[10px] text-pink-500/80 dark:text-pink-300/80 font-elysia-poem flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
                来自星海的回响
              </div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-3">
                "{selectedNode.replyContext.parentTarget.moodPhrase}"
              </div>
              <div className="text-xs text-right text-slate-500 dark:text-slate-400">
                — {selectedNode.replyContext.parentTarget.author.displayName}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <MindMapDetailModal 
        recordId={detailRecordId} 
        onClose={() => setDetailRecordId(null)} 
      />
    </div>
  );
};
