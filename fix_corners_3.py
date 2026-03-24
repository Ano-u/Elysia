import re

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "r", encoding="utf-8") as f:
    text = f.read()


old_panel = """                  <div className="w-[600px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl relative" style={{ isolation: "isolate" }}>
                    <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden pointer-events-none" style={{ maskImage: "radial-gradient(white, black)" }}></div>
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col h-full rounded-[2.5rem]">"""

new_panel = """                  <div className="w-[600px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl relative overflow-hidden" style={{ transform: "translateZ(0)" }}>
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col h-full">"""

text = text.replace(old_panel, new_panel)

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "w", encoding="utf-8") as f:
    f.write(text)

