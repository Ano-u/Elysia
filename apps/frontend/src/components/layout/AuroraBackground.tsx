import { motion } from "framer-motion";
import { useUiStore } from "../../store/uiStore";

export const AuroraBackground = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[var(--elysia-ice)] transition-colors duration-700 flex flex-col items-center justify-center">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {!reduceMotion ? (
          <>
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                x: [0, 50, 0],
                y: [0, 30, 0],
              }}
              transition={{
                duration: 12,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
              className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full blur-[120px] opacity-60 dark:opacity-40 mix-blend-multiply dark:mix-blend-screen"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-mist) 0%, transparent 70%)",
              }}
            />

            <motion.div
              animate={{
                scale: [1, 1.3, 1],
                x: [0, -40, 0],
                y: [0, 60, 0],
              }}
              transition={{
                duration: 15,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
              className="absolute top-[10%] -right-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] opacity-50 dark:opacity-30 mix-blend-multiply dark:mix-blend-screen"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-coral) 0%, transparent 70%)",
              }}
            />

            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                x: [0, 20, 0],
                y: [0, -20, 0],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
              className="absolute -bottom-[10%] left-[20%] w-[50vw] h-[50vw] rounded-full blur-[90px] opacity-40 dark:opacity-20 mix-blend-multiply dark:mix-blend-screen"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-gold) 0%, transparent 70%)",
              }}
            />
          </>
        ) : (
          // 减弱动画时的静态渐变
          <>
            <div
              className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full blur-[120px] opacity-60 dark:opacity-40 mix-blend-multiply dark:mix-blend-screen"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-mist) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute top-[10%] -right-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] opacity-50 dark:opacity-30 mix-blend-multiply dark:mix-blend-screen"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-coral) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute -bottom-[10%] left-[20%] w-[50vw] h-[50vw] rounded-full blur-[90px] opacity-40 dark:opacity-20 mix-blend-multiply dark:mix-blend-screen"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-gold) 0%, transparent 70%)",
              }}
            />
          </>
        )}
      </div>

      {/* Gentle Noise Overlay for Texture */}
      <div
        className="absolute inset-0 z-0 opacity-[0.015] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content Layer */}
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
};
