import type { Transition } from "framer-motion";

// 动画常量，确保“水滴融合、温柔水晶碰撞”的体感

// 基础物理弹簧参数（阻尼较高，刚度适中，不突兀）
export const SPRING_TRANSITION: Transition = {
  type: "spring",
  stiffness: 250,
  damping: 25,
  mass: 1,
};

// 缓动曲线参数
export const EASE_CURVE = [0.22, 1, 0.36, 1];

// 淡入淡出降级动画（用于 Reduced Motion）
export const REDUCED_MOTION_TRANSITION: Transition = {
  duration: 0.3,
  ease: "easeInOut",
};

// 获取合适的过渡配置
export const getTransition = (reduceMotion: boolean): Transition => {
  return reduceMotion ? REDUCED_MOTION_TRANSITION : SPRING_TRANSITION;
};
