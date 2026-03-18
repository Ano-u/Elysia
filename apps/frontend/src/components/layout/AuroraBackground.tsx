import { motion } from "framer-motion";
import { useUiStore } from "../../store/uiStore";

export const AuroraBackground = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  return (
    <div className="relative min-h-screen w-full overflow-hidden transition-colors duration-700 flex flex-col items-center justify-center bg-[var(--elysia-ice)] dark:bg-[var(--elysia-ice)]">
      {/* Abstract Liquid Glass Base Background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[var(--elysia-mist)]/10 via-transparent to-[var(--elysia-coral)]/5 dark:from-[var(--elysia-mist)]/5 dark:to-[var(--elysia-coral)]/5" />
      <div className="pointer-events-none absolute inset-x-[8%] top-[5%] z-0 h-[48%] rounded-[45%_45%_8%_8%/60%_60%_8%_8%] border border-white/35 bg-gradient-to-b from-white/18 to-transparent dark:border-white/10 dark:from-white/3" />
      <div className="pointer-events-none absolute inset-x-[16%] top-[10%] z-0 h-[40%] rounded-[42%_42%_8%_8%/56%_56%_8%_8%] border border-white/22 dark:border-white/7" />

      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {!reduceMotion ? (
          <>
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                x: [0, 30, 0],
                y: [0, 20, 0],
              }}
              transition={{
                duration: 20,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
              className="absolute -top-[10%] -left-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] opacity-40 dark:opacity-20 mix-blend-normal pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-mist) 0%, transparent 70%)",
              }}
            />

            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                x: [0, -20, 0],
                y: [0, 30, 0],
              }}
              transition={{
                duration: 25,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
              className="absolute top-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full blur-[90px] opacity-30 dark:opacity-15 mix-blend-normal pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-coral) 0%, transparent 70%)",
              }}
            />

            <motion.div
              animate={{
                scale: [1, 1.05, 1],
                x: [0, 15, 0],
                y: [0, -15, 0],
              }}
              transition={{
                duration: 18,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
              className="absolute -bottom-[10%] left-[10%] w-[55vw] h-[55vw] rounded-full blur-[110px] opacity-25 dark:opacity-10 mix-blend-normal pointer-events-none"
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
              className="absolute -top-[10%] -left-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] opacity-40 dark:opacity-20 mix-blend-normal pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-mist) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute top-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full blur-[90px] opacity-30 dark:opacity-15 mix-blend-normal pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, var(--elysia-coral) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute -bottom-[10%] left-[10%] w-[55vw] h-[55vw] rounded-full blur-[110px] opacity-25 dark:opacity-10 mix-blend-normal pointer-events-none"
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
