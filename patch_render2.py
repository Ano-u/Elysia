import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Try again with different matching strategy
content = content.replace(
    "{selectedCard && (",
    "{openedCards.length > 0 && ("
)

content = content.replace(
    "onClick={() => { setSelectedCard(null); setIsReplying(false); }}",
    "onClick={() => { setOpenedCards([]); setIsReplying(false); setReplyingToId(null); }}"
)

content = content.replace(
    "className=\"fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm\"",
    "className=\"fixed inset-0 z-[100] flex items-center p-4 bg-black/20 dark:bg-black/60 backdrop-blur-sm overflow-x-auto hide-scrollbar\""
)

content = content.replace(
    "className=\"flex gap-4 items-stretch h-auto max-h-[90vh]\" onClick={(e) => e.stopPropagation()}",
    "className=\"flex gap-6 items-stretch h-[85vh] min-h-[500px] w-max mx-auto px-10\" onClick={(e) => e.stopPropagation()}"
)

# Replace the single card div with a map loop
content = content.replace(
    "<motion.div\n              initial={{ opacity: 0, scale: 0.9, y: 20 }}",
    "{openedCards.map((selectedCard, index) => (\n              <motion.div\n              key={selectedCard.id || index}\n              initial={{ opacity: 0, scale: 0.9, y: 20 }}"
)

content = content.replace(
    "className=\"relative w-full max-w-lg flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden\"",
    "className=\"relative w-[500px] flex-shrink-0 flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden\""
)

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
              </div>
              </div>
            </motion.div>"""

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
                        }
                      }}
    
