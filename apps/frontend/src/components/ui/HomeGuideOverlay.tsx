import React from "react";
import { AnimatePresence, motion } from "framer-motion";

export type HomeGuideStepContent = {
  title: string;
  description: string;
};

interface HomeGuideOverlayProps {
  open: boolean;
  mode: "welcome" | "spotlight";
  stepIndex: number;
  stepCount: number;
  step?: HomeGuideStepContent | null;
  targetRect?: DOMRect | null;
  targetRadius?: number | null;
  onStart?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  onSkip: () => void;
}

type FocusRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  radius: number;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function toFocusRect(targetRect: DOMRect, targetRadius?: number | null): FocusRect {
  const inset = 6;
  const edgePadding = 8;
  const minWidth = 124;
  const minHeight = 88;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const desiredWidth = Math.max(minWidth, targetRect.width + inset * 2);
  const desiredHeight = Math.max(minHeight, targetRect.height + inset * 2);
  const maxWidth = Math.max(minWidth, viewportWidth - edgePadding * 2);
  const maxHeight = Math.max(minHeight, viewportHeight - edgePadding * 2);
  const width = clamp(desiredWidth, minWidth, maxWidth);
  const height = clamp(desiredHeight, minHeight, maxHeight);
  const left = clamp(targetRect.left - inset, edgePadding, viewportWidth - edgePadding - width);
  const top = clamp(targetRect.top - inset, edgePadding, viewportHeight - edgePadding - height);
  const right = left + width;
  const bottom = top + height;
  const normalizedRadius =
    typeof targetRadius === "number" && Number.isFinite(targetRadius) && targetRadius > 0
      ? targetRadius + inset
      : Math.min(width, height) * 0.16;
  const radius = clamp(normalizedRadius, 14, Math.min(width, height) / 2 - 2);

  return {
    top: Math.round(top),
    left: Math.round(left),
    right: Math.round(right),
    bottom: Math.round(bottom),
    width: Math.round(width),
    height: Math.round(height),
    radius: Math.round(radius),
  };
}

function expandFocusRect(
  rect: FocusRect,
  distance: number,
  viewportWidth: number,
  viewportHeight: number,
): FocusRect {
  const left = clamp(rect.left - distance, 0, viewportWidth);
  const top = clamp(rect.top - distance, 0, viewportHeight);
  const right = clamp(rect.right + distance, 0, viewportWidth);
  const bottom = clamp(rect.bottom + distance, 0, viewportHeight);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const radius = clamp(rect.radius + distance, 10, Math.min(width, height) / 2 - 1);

  return {
    top: Math.round(top),
    left: Math.round(left),
    right: Math.round(right),
    bottom: Math.round(bottom),
    width: Math.round(width),
    height: Math.round(height),
    radius: Math.round(radius),
  };
}

type CornerPosition = "tl" | "tr" | "bl" | "br";

function cornerMaskStyle(corner: CornerPosition, radius: number): React.CSSProperties {
  const stop = Math.max(1, radius - 1);
  const gradient =
    corner === "tl"
      ? `radial-gradient(circle at 100% 100%, transparent ${stop}px, #000 ${radius}px)`
      : corner === "tr"
        ? `radial-gradient(circle at 0% 100%, transparent ${stop}px, #000 ${radius}px)`
        : corner === "bl"
          ? `radial-gradient(circle at 100% 0%, transparent ${stop}px, #000 ${radius}px)`
          : `radial-gradient(circle at 0% 0%, transparent ${stop}px, #000 ${radius}px)`;

  return {
    WebkitMaskImage: gradient,
    maskImage: gradient,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

type RoundedBlurLayerProps = {
  cutout: FocusRect;
  viewportWidth: number;
  viewportHeight: number;
  blurPx: number;
  tintOpacity: number;
  zIndex: number;
};

const RoundedBlurLayer: React.FC<RoundedBlurLayerProps> = ({
  cutout,
  viewportWidth,
  viewportHeight,
  blurPx,
  tintOpacity,
  zIndex,
}) => {
  const seamFix = 1;
  const cornerSize = Math.max(2, cutout.radius + seamFix);
  const layerStyle: React.CSSProperties = {
    backdropFilter: `blur(${blurPx}px)`,
    WebkitBackdropFilter: `blur(${blurPx}px)`,
    opacity: tintOpacity,
    zIndex,
  };

  return (
    <>
      <div
        className="fixed left-0 top-0 w-full bg-white dark:bg-slate-950"
        style={{ ...layerStyle, height: cutout.top + seamFix }}
      />
      <div
        className="fixed left-0 bg-white dark:bg-slate-950"
        style={{
          ...layerStyle,
          top: cutout.top - seamFix,
          width: cutout.left + seamFix,
          height: cutout.height + seamFix * 2,
        }}
      />
      <div
        className="fixed right-0 bg-white dark:bg-slate-950"
        style={{
          ...layerStyle,
          top: cutout.top - seamFix,
          width: Math.max(0, viewportWidth - cutout.right + seamFix),
          height: cutout.height + seamFix * 2,
        }}
      />
      <div
        className="fixed left-0 bottom-0 w-full bg-white dark:bg-slate-950"
        style={{
          ...layerStyle,
          top: cutout.bottom - seamFix,
          height: Math.max(0, viewportHeight - cutout.bottom + seamFix),
        }}
      />

      <div
        className="fixed bg-white dark:bg-slate-950"
        style={{
          ...layerStyle,
          ...cornerMaskStyle("tl", cutout.radius),
          left: cutout.left - seamFix,
          top: cutout.top - seamFix,
          width: cornerSize,
          height: cornerSize,
        }}
      />
      <div
        className="fixed bg-white dark:bg-slate-950"
        style={{
          ...layerStyle,
          ...cornerMaskStyle("tr", cutout.radius),
          left: cutout.right - cornerSize + seamFix,
          top: cutout.top - seamFix,
          width: cornerSize,
          height: cornerSize,
        }}
      />
      <div
        className="fixed bg-white dark:bg-slate-950"
        style={{
          ...layerStyle,
          ...cornerMaskStyle("bl", cutout.radius),
          left: cutout.left - seamFix,
          top: cutout.bottom - cornerSize + seamFix,
          width: cornerSize,
          height: cornerSize,
        }}
      />
      <div
        className="fixed bg-white dark:bg-slate-950"
        style={{
          ...layerStyle,
          ...cornerMaskStyle("br", cutout.radius),
          left: cutout.right - cornerSize + seamFix,
          top: cutout.bottom - cornerSize + seamFix,
          width: cornerSize,
          height: cornerSize,
        }}
      />
    </>
  );
};

export const HomeGuideOverlay: React.FC<HomeGuideOverlayProps> = ({
  open,
  mode,
  stepIndex,
  stepCount,
  step,
  targetRect,
  targetRadius,
  onStart,
  onBack,
  onNext,
  onSkip,
}) => {
  const hasTarget = mode === "spotlight" && Boolean(targetRect);
  const focusRect = hasTarget && targetRect ? toFocusRect(targetRect, targetRadius ?? null) : null;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const continuousLayers = (() => {
    if (!focusRect) {
      return [] as Array<{ cutout: FocusRect; blurPx: number; tintOpacity: number }>;
    }

    const steps = 32;
    const maxDistance = Math.min(360, Math.max(180, Math.min(viewportWidth, viewportHeight) * 0.52));
    let prevTargetOpacity = 0;
    const output: Array<{ cutout: FocusRect; blurPx: number; tintOpacity: number }> = [];

    for (let index = 0; index < steps; index += 1) {
      const t = (index + 1) / steps;
      const easedDistance = Math.pow(t, 2.15);
      const easedBlur = Math.pow(t, 1.82);
      const easedOpacity = Math.pow(t, 1.64);
      const distance = Math.round(maxDistance * easedDistance);
      const blurPx = 1 + 26 * easedBlur;
      const targetOpacity = 0.06 + 0.34 * easedOpacity;
      const tintOpacity = Math.max(0.006, targetOpacity - prevTargetOpacity);
      prevTargetOpacity = targetOpacity;
      output.push({
        cutout: expandFocusRect(focusRect, distance, viewportWidth, viewportHeight),
        blurPx,
        tintOpacity,
      });
    }

    return output;
  })();

  const bubbleWidth = Math.max(120, Math.min(clamp(viewportWidth - 24, 160, 360), viewportWidth - 12));
  const bubbleHeight = 210;
  const bubblePadding = 16;
  const placeAbove = focusRect ? focusRect.bottom + bubbleHeight + 24 > viewportHeight : false;

  const bubbleTop = focusRect
    ? placeAbove
      ? clamp(focusRect.top - bubbleHeight - 14, bubblePadding, viewportHeight - bubbleHeight - bubblePadding)
      : clamp(focusRect.bottom + 14, bubblePadding, viewportHeight - bubbleHeight - bubblePadding)
    : 0;

  const bubbleLeft = focusRect
    ? clamp(focusRect.left + Math.min(48, focusRect.width * 0.22), bubblePadding, viewportWidth - bubbleWidth - bubblePadding)
    : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {mode === "welcome" && (
            <motion.div
              key="guide-welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[118] bg-[radial-gradient(circle_at_18%_16%,rgba(255,245,252,0.72),transparent_42%),radial-gradient(circle_at_82%_12%,rgba(215,233,255,0.52),transparent_42%),linear-gradient(145deg,rgba(248,251,255,0.72),rgba(251,243,252,0.64),rgba(236,247,255,0.68))] backdrop-blur-[16px]"
            >
              <div className="pointer-events-none absolute inset-0 bg-white/28 dark:bg-slate-950/42" />
              <div className="relative z-[119] flex h-full w-full items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full max-w-xl rounded-[2rem] border border-white/80 bg-[linear-gradient(145deg,rgba(255,248,255,0.94),rgba(246,238,255,0.9),rgba(239,247,255,0.92))] p-6 shadow-[0_24px_56px_rgba(160,142,211,0.32),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-3xl dark:border-white/20 dark:bg-[linear-gradient(145deg,rgba(36,26,56,0.88),rgba(42,32,66,0.86),rgba(22,35,60,0.88))]"
                >
                  <p className="text-[11px] tracking-[0.22em] text-slate-400/90 dark:text-slate-300/65">ELYSIA · 新人引导</p>
                  <h3 className="mt-2 font-elysia-title text-[2.2rem] leading-tight text-slate-700 dark:text-white">让爱莉希雅来接住你吧♪</h3>
                  <p className="mt-3 font-elysia-display text-base leading-relaxed text-slate-600 dark:text-slate-200/88">
                    第一次来到往世乐土时，爱莉会用 3 步轻轻带你熟悉这里。先写一句就很好，剩下的我们慢慢来，好吗？♪
                  </p>
                  <div className="mt-6 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={onSkip}
                      className="rounded-full border border-white/70 bg-white/82 px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-slate-200"
                    >
                      稍后再看
                    </button>
                    <button
                      type="button"
                      onClick={onStart}
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                    >
                      和爱莉一起看看
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {mode === "spotlight" && focusRect && (
            <motion.div
              key={`guide-spotlight-${stepIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[118]"
            >
              {continuousLayers.map((layer, index) => (
                <RoundedBlurLayer
                  key={`guide-layer-${index}-${layer.cutout.left}-${layer.cutout.top}-${layer.cutout.width}-${layer.cutout.height}`}
                  cutout={layer.cutout}
                  viewportWidth={viewportWidth}
                  viewportHeight={viewportHeight}
                  blurPx={layer.blurPx}
                  tintOpacity={layer.tintOpacity}
                  zIndex={119}
                />
              ))}

              <div
                className="pointer-events-none fixed z-[121] border border-white/85 shadow-[0_20px_52px_rgba(142,133,196,0.28),inset_0_0_0_1px_rgba(255,255,255,0.58)] dark:border-white/30"
                style={{
                  top: focusRect.top,
                  left: focusRect.left,
                  width: focusRect.width,
                  height: focusRect.height,
                  borderRadius: `${focusRect.radius}px`,
                }}
              />

              <div
                className="fixed z-[123] rounded-[1.55rem] border border-white/85 bg-[linear-gradient(145deg,rgba(255,248,255,0.95),rgba(245,236,255,0.9),rgba(236,246,255,0.92))] px-4 py-3 text-sm shadow-[0_20px_44px_rgba(161,138,209,0.32),0_8px_22px_rgba(253,180,225,0.22)] backdrop-blur-3xl dark:border-white/25 dark:bg-[linear-gradient(145deg,rgba(37,24,58,0.9),rgba(44,31,68,0.9),rgba(24,36,62,0.9))]"
                style={{
                  top: bubbleTop,
                  left: bubbleLeft,
                  width: bubbleWidth,
                }}
              >
                <div
                  className="absolute h-3 w-3 rotate-45 border border-white/65 bg-[rgba(255,248,255,0.95)] dark:border-white/20 dark:bg-[rgba(44,31,68,0.92)]"
                  style={{
                    left: clamp(focusRect.left + focusRect.width * 0.3 - bubbleLeft, 16, bubbleWidth - 20),
                    top: placeAbove ? "calc(100% - 6px)" : "-6px",
                  }}
                />
                <p className="text-[11px] tracking-[0.18em] text-slate-400/95 dark:text-slate-300/65">
                  第 {stepIndex + 1} 步 / {stepCount} 步
                </p>
                <h4 className="mt-1 font-elysia-display text-lg leading-snug text-slate-700 dark:text-white">{step?.title}</h4>
                <p className="mt-1.5 font-elysia-display text-sm leading-relaxed text-slate-600 dark:text-slate-200/88">
                  {step?.description}
                </p>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onSkip}
                    className="rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-slate-200"
                  >
                    先跳过
                  </button>
                  <div className="flex items-center gap-2">
                    {stepIndex > 0 && (
                      <button
                        type="button"
                        onClick={onBack}
                        className="rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-slate-200"
                      >
                        回到上一步
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onNext}
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                    >
                      {stepIndex >= stepCount - 1 ? "我明白啦" : "继续看看"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
};
