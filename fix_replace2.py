import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_footer_start = "              {/* Footer Author */}"
old_panel_start = "            {/* Right Side: The Reply Panel */}"

start_idx = content.find(old_footer_start)
end_idx = content.find(old_panel_start)

if start_idx != -1 and end_idx != -1:
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
                  {selectedCard.replyContext?.showRootArrow && selectedCard.replyContext?.rootRecordId && selectedCard.replyContext?.rootRecordId !== selectedCard.replyContext?.parentRecordId && !openedCards.find(c => c.id === selectedCard.replyContext?.rootRecordId) && (
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
                      className="w-8 h-8 rounded-full bg-white/50 dark:bg-slate-800/50 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-500 transition-colors"
                      title="查看源头心声"
                    >
                      <ArrowUpToLine className="w-4 h-4" />
                    </button>
                  )}
                  
                  {index === openedCards.length - 1 && (
                    <button 
                      onClick={() => { setOpenedCards([]); setIsReplying(false); setReplyingToId(null); }}
                      className="w-8 h-8 rounded-full bg-slate-900/10 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              </div>
            </motion.div>
            ))}

"""
    new_content = content[:start_idx] + new_footer + "            {/* Right Side: The Reply Panel */}" + content[end_idx + len(old_panel_start):]
    
    with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Replaced successfully")
else:
    print("Could not find start or end index")

