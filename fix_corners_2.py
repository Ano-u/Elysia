import re

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Let's inspect the ActionPairRow structure, maybe the bottom element inside ActionPairRow is overflowing the rounded corners.
# In the first image, the straight edge is the "white/80" background bleeding out from the bottom.
# This means the scrolling container itself or its contents are drawing a straight white background at the very bottom that ignores the overflow-hidden mask.

old_panel = """                  <div className="w-[600px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden relative">
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col rounded-[2.5rem]">"""

# I need to make sure the scroll area doesn't break out of the flex container causing square corners.
# Also, the background color might need to be isolated.

new_panel = """                  <div className="w-[600px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl relative" style={{ isolation: "isolate" }}>
                    <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden pointer-events-none" style={{ maskImage: "radial-gradient(white, black)" }}></div>
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col h-full rounded-[2.5rem]">"""

text = text.replace(old_panel, new_panel)

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "w", encoding="utf-8") as f:
    f.write(text)

