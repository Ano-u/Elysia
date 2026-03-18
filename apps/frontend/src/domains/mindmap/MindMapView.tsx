import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import * as d3 from "d3-force";
import { useUiStore } from "../../store/uiStore";
import { getMindMapMe } from "../../lib/apiClient";
import type { MindMapNode, MindMapEdge } from "../../types/api";

type SimulationNode = MindMapNode & d3.SimulationNodeDatum;
type SimulationLink = MindMapEdge & d3.SimulationLinkDatum<SimulationNode>;

export const MindMapView: React.FC = () => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  // Use persistent state for mindmap mode
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

  const [nodes, setNodes] = useState<SimulationNode[]>([]);
  const [links, setLinks] = useState<SimulationLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimulationNode, SimulationLink> | null>(null);

  // Initialize force simulation when data changes
  useEffect(() => {
    if (!data || !data.nodes || !data.edges) return;

    // Deep copy data for D3 to mutate
    const simulationNodes: SimulationNode[] = data.nodes.map(n => ({ ...n }));
    const simulationLinks: SimulationLink[] = data.edges.map(e => ({ ...e }));

    const width = window.innerWidth;
    const height = window.innerHeight;

    const simulation = d3.forceSimulation<SimulationNode>(simulationNodes)
      .force("link", d3.forceLink<SimulationNode, SimulationLink>(simulationLinks).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(60))
      .alphaDecay(reduceMotion ? 0.1 : 0.02) // Stop faster if reduced motion
      .on("tick", () => {
        // Trigger re-render with new positions
        setNodes([...simulationNodes]);
        setLinks([...simulationLinks]);
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [data, reduceMotion]);

  // Handle Dragging
  const dragEvents = {
    onDragStart: (_e: unknown, node: SimulationNode) => {
      if (!simulationRef.current) return;
      if (!reduceMotion) simulationRef.current.alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
    },
    onDrag: (_e: unknown, info: unknown, node: SimulationNode) => {
      // Basic implementation for framer-motion drag update
      const dragInfo = info as { point?: { x: number, y: number } };
      if (dragInfo && dragInfo.point) {
         node.fx = dragInfo.point.x;
         node.fy = dragInfo.point.y;
      }
    },
    onDragEnd: (_e: unknown, node: SimulationNode) => {
      if (!simulationRef.current) return;
      if (!reduceMotion) simulationRef.current.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    }
  };

  if (isLoading) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="font-elysia-poem text-[1.5rem] leading-none text-slate-500 animate-pulse">正在织起你的记忆星线...</div>
        </div>
     );
  }

  if (isError) {
    return (
       <div className="flex flex-col items-center justify-center min-h-screen">
         <div className="text-red-400 font-light text-sm">记忆织网暂时失去连接，请稍后再试。</div>
       </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-transparent z-10 select-none">
      {/* Background Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-30 mix-blend-overlay"
        style={{
          backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }}
      />

      {/* Mode Switcher */}
      <div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-[11px] tracking-[0.14em] text-slate-500 backdrop-blur-md dark:border-white/10 dark:bg-black/20 dark:text-slate-300/70">
        轻触节点可高亮关系 · 拖动节点可重排结构
      </div>

      <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-1 bg-white/10 dark:bg-black/20 backdrop-blur-md rounded-full border border-white/20">
         <button
           onClick={() => setMode('simple')}
           className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${mode === 'simple' ? 'bg-white/90 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
         >
            静心
         </button>
         <button
           onClick={() => setMode('deep')}
           className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${mode === 'deep' ? 'bg-white/90 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
         >
            深潜
         </button>
      </div>

      {/* SVG for Edges */}
      <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <g strokeOpacity={0.6}>
          {links.map((link, i) => {
            const isHighlighted = selectedNodeId && (
              (link.source as SimulationNode).id === selectedNodeId ||
              (link.target as SimulationNode).id === selectedNodeId
            );

            return (
              <motion.line
                key={`link-${i}`}
                x1={(link.source as SimulationNode).x}
                y1={(link.source as SimulationNode).y}
                x2={(link.target as SimulationNode).x}
                y2={(link.target as SimulationNode).y}
                stroke={isHighlighted ? "rgba(255,182,193,0.8)" : "rgba(148,163,184,0.3)"}
                strokeWidth={isHighlighted ? 2 : Math.max(0.5, link.strength * 2)}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            );
          })}
        </g>
      </svg>

      {/* HTML Nodes overlay for better interaction/rendering */}
      <div className="absolute inset-0 w-full h-full z-20">
        <AnimatePresence>
          {nodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isRelated = links.some(l =>
              ((l.source as SimulationNode).id === selectedNodeId && (l.target as SimulationNode).id === node.id) ||
              ((l.target as SimulationNode).id === selectedNodeId && (l.source as SimulationNode).id === node.id)
            );

            const isDimmed = selectedNodeId !== null && !isSelected && !isRelated;

            return (
              <motion.div
                key={node.id}
                layoutId={`node-${node.id}`}
                className={`absolute cursor-grab active:cursor-grabbing rounded-full flex items-center justify-center text-center p-3 sm:p-4 backdrop-blur-md border shadow-sm transition-opacity duration-300 ${
                  node.type === 'theme'
                    ? 'bg-amber-100/40 border-amber-200/50 dark:bg-amber-900/40 dark:border-amber-700/50 text-amber-900 dark:text-amber-100 w-24 h-24 sm:w-32 sm:h-32 rounded-full'
                    : 'bg-white/60 border-white/40 dark:bg-slate-800/60 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 min-w-[100px] max-w-[200px] rounded-2xl'
                } ${isDimmed ? 'opacity-20' : 'opacity-100'}`}
                style={{
                  left: node.x,
                  top: node.y,
                  transform: 'translate(-50%, -50%)'
                }}
                drag
                dragMomentum={false}
                onDragStart={(e: unknown) => dragEvents.onDragStart(e, node)}
                onDrag={(e: unknown, info: unknown) => dragEvents.onDrag(e, info, node)}
                onDragEnd={(e: unknown) => dragEvents.onDragEnd(e, node)}
                onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-xs sm:text-sm font-medium line-clamp-3 pointer-events-none">
                  {node.label}
                </span>

                {/* Node Glow */}
                {node.isFocus && (
                  <div className="absolute -inset-2 bg-pink-300/30 rounded-full blur-xl -z-10 pointer-events-none" />
                )}
                {isSelected && (
                  <div className="absolute -inset-1 ring-2 ring-pink-400/50 rounded-[inherit] -z-10 pointer-events-none" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

    </div>
  );
};
