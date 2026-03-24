import re

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

old_code = """            {/* Right Side: The Reply Panel */}
            <AnimatePresence>
              {isReplying && (
                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 600, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="overflow-hidden h-full flex-shrink-0"
                >
                  <div className="w-[600px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl relative overflow-hidden" style={{ transform: "translateZ(0)" }}>
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col h-full">"""

new_code = """            {/* Right Side: The Reply Panel */}
            <AnimatePresence>
              {isReplying && (
                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 600, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="h-full flex-shrink-0 flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl relative overflow-hidden"
                  style={{ transform: "translateZ(0)" }}
                >
                  <div className="w-[600px] h-full p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col">"""

text = text.replace(old_code, new_code)

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "w", encoding="utf-8") as f:
    f.write(text)

