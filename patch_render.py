import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the modal rendering logic
old_modal_start = """      <AnimatePresence>
        {selectedCard && ("""

new_modal_start = """      <AnimatePresence>
        {openedCards.length > 0 && ("""

content = content.replace(old_modal_start, new_modal_start)

# Replace the backdrop click handler
old_backdrop = """            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => { setSelectedCard(null); setIsReplying(false); }}
          >
            <div className="flex gap-4 items-stretch h-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <motion.div"""

new_backdrop = """            className="fixed inset-0 z-[100] flex items-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm overflow-x-auto hide-scrollbar"
            onClick={() => { setOpenedCards([]); setIsReplying(false); setReplyingToId(null); }}
          >
            <div className="flex gap-6 items-stretch h-[80vh] min-h-[500px] mx-auto px-10" onClick={(e) => e.stopPropagation()}>
              {openedCards.map((selectedCard, index) => (
                <motion.div
                  key={selectedCard.id || index}"""

content = content.replace(old_backdrop, new_backdrop)

# The end of the map
# Find the end of the motion.div for the card, which is just before {/* Right Side: The Reply Panel */}
old_panel_start = """              </div>
            </motion.div>

            {/* Right Side: The Reply Panel */}"""

new_panel_start = """              </div>
            </motion.div>
            ))}

            {/* Right Side: The Reply Panel */}"""

content = content.replace(old_panel_start, new_panel_start)

# In the footer, update the buttons
old_footer = """              {/* Footer Author */}
              <div className="mt-8 pt-4 border-t border-slate-200/60 dark:border-slate-700/50 flex justify-between items-center relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-400 to-purple-400 flex items-center justify-center text-white font-bold shadow-md">
                    {(selectedCard.authorName || '无')[0]}
                  </div>
                  <span className="font-elysia-display text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {selectedCard.authorName || '无名星光'}
                  </span>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsReplying(!isReplying)}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 text-sm font-medium hover:scale-105 transition-transform shadow-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {isReplying ? "收起" : "添加评论"}
                  </button>
                  <button 
                    onClick={() => { setSelectedCard(null); setIsReplying(false); }}
                    className="px-6 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium hover:scale-105 transition-transform shadow-lg"
                  >
                    关闭
                  </button>
                </div>
              </div>"""

new_footer = """              {/* Footer Author */}
              <div className="mt-auto pt-4 border-t border-slate-200/60 dark:border-slate-700/50 flex justify-between items-center relative z-10">
                <div 
                  className="group flex items-center gap-2 relative cursor-pointer"
                  onClick={() => {
                    const isCurrentReplying = isReplying && replyingToId === selectedCard.id;
                    setIsReplying(!isCurrentReplying);
                    setReplyingToId(!isCurrentReplying ? selectedCard.id : null);
                  }}
                >
                  <div className="flex items-center gap-2 transition-opacity duration-300 group-hover:opacity-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-400 to-purple-400 flex items-center justify-center text-white font-bold shadow-md">
                      {(selectedCard.authorName || '无')[0]}
                    </div>
                    <span className="font-elysia-display text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {selectedCard.authorName || '无名星光'}
                    </span>
                  </div>
                  
                  <div className="absolute inset-0 flex items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 text-sm font-medium shadow-sm">
                      <MessageCircle className="w-4 h-4" />
                      {(isReplying && replyingToId === selectedCard.id) ? "收起面板" : "添加评论"}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {/* 查看父帖图标 */}
                  {selectedCard.replyContext?.showParentArrow && selectedCard.replyContext?.parentRecordId && !openedCards.find(c => c.id === selectedCard.replyContext?.parentRecordId) && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await getRecord(selectedCard.replyContext.parentRecordId);
                          if (res.record) {
                            const newCard = {
                              ...res.record,
                              authorName: res.author.displayName,
                              authorAvatar: res.author.avatarUrl,
                              tags: res.tags,
                              extraEmotions: res.extraEmotions,
                              quote: res.quote,
                              replyContext: res.replyContext
                            };
                            setOpenedCards(prev => [...prev, newCard]);
                          }
                        } catch (e) {
                          console.error("Failed to fetch parent record", e);
                        }
                      }}
                      className="w-8 h-8 rounded-full bg-white/50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-500 transition-colors"
                      title="查看所回复的心声"
                    >
                      <CornerLeftUp className="w-4 h-4" />
                    </button>
                  )}
                  
                  {/* 查看主帖图标 */}
                  {selectedCard.replyContext?.showRootArrow && selectedCard.replyContext?.rootRecordId && !openedCards.find(c => c.id === selectedCard.replyContext?.rootRecordId) && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await getRecord(selectedCard.replyContext.rootRecordId);
                          if (res.record) {
                            const newCard = {
                              ...res.record,
                              authorName: res.author.displayName,
                              authorAvatar: res.author.avatarUrl,
                              tags: res.tags,
                              extraEmotions: res.extraEmotions,
                              quote: res.quote,
                              replyContext: res.replyContext
                            };
                            setOpenedCards(prev => [...prev, newCard]);
                          }
                        } catch (e) {
                          console.error("Failed to fetch root record", e);
           
