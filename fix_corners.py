import re

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Replace the panel with fixed border radius
old_panel = """                  <div className="w-[520px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col">"""

new_panel = """                  <div className="w-[600px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden relative">
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col rounded-[2.5rem]">"""

text = text.replace(old_panel, new_panel)

# change animate widths as well
old_anim = """                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 520, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}"""
new_anim = """                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 600, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}"""
text = text.replace(old_anim, new_anim)


with open("apps/frontend/src/domains/universe/UniverseView.tsx", "w", encoding="utf-8") as f:
    f.write(text)

