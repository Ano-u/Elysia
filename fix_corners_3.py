import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the beginning of the AnimatePresence block properly
old_start = """      {/* 详细查看的弹窗 (Expanded Detail View) */}
      <AnimatePresence>
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => { setSelectedCard(null); setIsReplying(false); }}
          >
            <div className="flex gap-4 items-stretch h-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden"
            >"""

new_start = """      {/* 详细查看的弹窗 (Expanded Detail View) */}
      <AnimatePresence>
        {openedCards.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm overflow-x-auto hide-scrollbar"
            onClick={() => { setOpenedCards([]); setIsReplying(false); setReplyingToId(null); }}
          >
            <div className="flex gap-6 items-stretch h-[85vh] min-h-[500px] w-max mx-auto px-10" onClick={(e) => e.stopPropagation()}>
            {openedCards.map((selectedCard, index) => (
            <motion.div
              key={selectedCard.id || index}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-[500px] flex-shrink-0 flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden"
            >"""

content = content.replace(old_start, new_start)

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
