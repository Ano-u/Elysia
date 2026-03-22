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
    <div className="absolute inset-0 overflow-hidden bg-slate-950/20 dark:bg-slate-950/45 z-10 select-none">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_14%_12%,rgba(255,255,255,0.34),transparent_38%),radial-gradient(circle_at_86%_8%,rgba(251,191,36,0.16),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(244,114,182,0.14),transparent_45%)]" />
      {/* Background Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-28 dark:opacity-30 mix-blend-overlay"
        style={{
          backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }}
      />

      {/* Mode Switcher */}
      <div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-white/50 bg-white/72 px-4 py-1 text-[11px] tracking-[0.14em] text-slate-600 backdrop-blur-md dark:border-white/15 dark:bg-black/35 dark:text-slate-200/80">
        轻触节点可高亮关系 · 拖动节点可重排结构
      </div>

      <div className="absolute top-28 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-1 bg-white/72 dark:bg-black/35 backdrop-blur-md rounded-full border border-white/50 dark:border-white/15">
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

      {/* SVG for Edges — 光丝流动线 */}
      <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <defs>
          {/* 径向渐变 — 水晶气泡节点 */}
          <radialGradient id="crystal-pink" cx="40%" cy="35%">
            <stop offset="0%" stopColor="var(--elysia-butterfly)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--elysia-coral)" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="crystal-gold" cx="40%" cy="35%">
            <stop offset="0%" stopColor="var(--elysia-gold)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fff8e7" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="crystal-lavender" cx="40%" cy="35%">
            <stop offset="0%" stopColor="var(--elysia-lavender)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--elysia-crystal)" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="crystal-blue" cx="40%" cy="35%">
            <stop offset="0%" stopColor="var(--elysia-bowstring)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--elysia-mist)" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="crystal-mist" cx="40%" cy="35%">
            <stop offset="0%" stopColor="var(--elysia-mist)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
          </radialGradient>
          {/* 光丝连线渐变 */}
          <linearGradient id="silk-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--elysia-gold)" stopOpacity="0.5" />
            <stop offset="50%" stopColor="var(--elysia-butterfly)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--elysia-gold)" stopOpacity="0.5" />
          </linearGradient>
          {/* 玻璃模糊滤镜 */}
          <filter id="glass-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
          </filter>
        </defs>

        {/* 中心装饰花朵 */}
        <g opacity="0.1" transform={`translate(${typeof window !== 'undefined' ? window.innerWidth / 2 : 600}, ${typeof window !== 'undefined' ? window.innerHeight / 2 : 400})`}>
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <ellipse
              key={`flower-${angle}`}
              cx={0}
              cy={-28}
              rx={12}
              ry={28}
              fill="var(--elysia-crystal)"
              transform={`rotate(${angle})`}
            />
          ))}
          <circle r={8} fill="var(--elysia-butterfly)" opacity="0.3" />
        </g>

        {/* 光丝连线 */}
        <g>
          {links.map((link, i) => {
            const source = link.source as SimulationNode;
            const target = link.target as SimulationNode;
            const isHighlighted = selectedNodeId && (
              source.id === selectedNodeId || target.id === selectedNodeId
            );

            // 贝塞尔曲线控制点：中点垂直偏移
            const mx = ((source.x ?? 0) + (target.x ?? 0)) / 2;
            const my = ((source.y ?? 0) + (target.y ?? 0)) / 2;
            const dx = (target.x ?? 0) - (source.x ?? 0);
            const dy = (target.y ?? 0) - (source.y ?? 0);
            const len = Math.sqrt(dx * dx + dy * dy);
            const offset = Math.min(len * 0.2, 40) * (i % 2 === 0 ? 1 : -1);
            const nx = len > 0 ? -dy / len : 0;
            const ny = len > 0 ? dx / len : 0;
            const cx = mx + nx * offset;
            const cy = my + ny * offset;

            const d = `M ${source.x ?? 0},${source.y ?? 0} Q ${cx},${cy} ${target.x ?? 0},${target.y ?? 0}`;
            const strength = link.strength ?? 0.5;

            return (
              <g key={`link-${i}`}>
                {/* 底层光晕 */}
                {isHighlighted && (
                  <path
                    d={d}
                    stroke="var(--elysia-lavender)"
                    strokeWidth="5"
                    fill="none"
                    opacity="0.12"
                    strokeLinecap="round"
                  />
                )}
                {/* 主光丝 */}
                <path
                  d={d}
                  stroke={isHighlighted ? "var(--elysia-butterfly)" : "url(#silk-gradient)"}
                  strokeWidth={isHighlighted ? 1.8 : (strength > 0.7 ? 1.5 : 0.8)}
                  fill="none"
                  opacity={isHighlighted ? 0.7 : (strength > 0.7 ? 0.45 : 0.2)}
                  strokeLinecap="round"
                  strokeDasharray={strength > 0.7 ? "8 12" : "4 16"}
                  className={reduceMotion ? "" : "animate-silk-flow"}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* 水晶气泡节点 */}
      <div className="absolute inset-0 w-full h-full z-20">
        <AnimatePresence>
          {nodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isRelated = links.some(l =>
              ((l.source as SimulationNode).id === selectedNodeId && (l.target as SimulationNode).id === node.id) ||
              ((l.target as SimulationNode).id === selectedNodeId && (l.source as SimulationNode).id === node.id)
            );

            const isDimmed = selectedNodeId !== null && !isSelected && !isRelated;

            // 节点类型色调映射
            const isTheme = node.type === 'theme';
            const nodeSize = isTheme ? 140 : 110;
            const colorMap: Record<string, { bg: string; border: string; glow: string; clipPath: string }> = {
              record:  { bg: 'var(--elysia-butterfly)', border: 'var(--elysia-coral)',     glow: 'var(--elysia-petal)', clipPath: 'polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)' }, // Hexagon
              quote:   { bg: 'var(--elysia-gold)',      border: '#ffe4a0',                 glow: 'rgba(255,244,216,0.2)', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }, // Rhombus
              emotion: { bg: 'var(--elysia-lavender)',   border: 'var(--elysia-crystal)',   glow: 'rgba(200,162,232,0.15)', clipPath: 'polygon(50% 0%, 80% 10%, 100% 35%, 100% 70%, 80% 90%, 50% 100%, 20% 90%, 0% 70%, 0% 35%, 20% 10%)' }, // Flower-like decagon
              theme:   { bg: 'var(--elysia-bowstring)',  border: 'var(--elysia-mist)',      glow: 'rgba(168,216,234,0.15)', clipPath: 'circle(50% at 50% 50%)' },
              comment: { bg: 'var(--elysia-mist)',       border: '#d0e4ff',                 glow: 'rgba(230,241,255,0.15)', clipPath: 'polygon(10% 0, 100% 0, 90% 100%, 0% 100%)' }, // Parallelogram
            };
            const shapeProps = colorMap[node.type] || colorMap.record;

            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: isDimmed ? 0.2 : 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: reduceMotion ? 0.15 : 0.4, ease: "easeOut" }}
                className="absolute cursor-grab active:cursor-grabbing flex items-center justify-center text-center transition-opacity duration-300"
                style={{
                  left: node.x,
                  top: node.y,
                  width: nodeSize,
                  height: nodeSize,
                  transform: 'translate(-50%, -50%)',
                }}
                drag
                dragMomentum={false}
                onDragStart={(e: unknown) => dragEvents.onDragStart(e, node)}
                onDrag={(e: unknown, info: unknown) => dragEvents.onDrag(e, info, node)}
                onDragEnd={(e: unknown) => dragEvents.onDragEnd(e, node)}
                onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
              >
                {/* 外层光晕 */}
                {(node.isFocus || isSelected) && (
                  <div
                    className="absolute -z-10 pointer-events-none"
                    style={{
                      inset: '-12px',
                      background: `radial-gradient(circle, ${shapeProps.glow} 0%, transparent 70%)`,
                      filter: 'blur(8px)',
                      clipPath: shapeProps.clipPath,
                    }}
                  />
                )}

                {/* 主气泡/刻印 */}
                <div
                  className={`absolute inset-0 ${reduceMotion ? '' : 'backdrop-blur-sm'}`}
                  style={{
                    background: `radial-gradient(ellipse at 40% 35%, ${shapeProps.bg}80 0%, ${shapeProps.bg}33 100%)`,
                    border: `1px solid ${shapeProps.border}66`,
                    clipPath: shapeProps.clipPath,
                  }}
                />

                {/* 内部高光弧 — 模拟玻璃反射 */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    top: '15%',
                    left: '20%',
                    width: '60%',
                    height: '30%',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
                    clipPath: shapeProps.clipPath,
                  }}
                />

                {/* 内部微光脉冲 */}
                {!reduceMotion && (
                  <div
                    className="absolute pointer-events-none animate-crystal-pulse"
                    style={{
                      inset: '30%',
                      background: `radial-gradient(circle, ${shapeProps.bg}22 0%, transparent 70%)`,
                      clipPath: shapeProps.clipPath,
                    }}
                  />
                )}

                {/* 文字标签 */}
                <span className="relative z-10 text-[10px] sm:text-xs font-medium line-clamp-3 pointer-events-none px-3 text-slate-800 dark:text-slate-100 drop-shadow-md">
                  {node.label}
                </span>

                {/* 选中环 */}
                {isSelected && (
                  <div
                    className="absolute -inset-1 pointer-events-none"
                    style={{
                      border: `2px solid ${shapeProps.border}88`,
                      clipPath: shapeProps.clipPath,
                    }}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

    </div>
  );
};
