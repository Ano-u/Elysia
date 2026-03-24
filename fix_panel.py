import re

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

old_panel = """            {/* Right Side: The Reply Panel */}
            <AnimatePresence>
              {isReplying && (
                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 440, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="overflow-hidden h-full flex-shrink-0"
                >
                  <div className="w-[440px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl p-6 overflow-y-auto hide-scrollbar">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 font-elysia-display flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-pink-500" />
                      回应这份心意
                    </h3>
                    
                    <MainInputCard
                      moodPhrase={replyDraft.moodPhrase}
                      setMoodPhrase={(v) => setReplyDraft({ ...replyDraft, moodPhrase: v })}
                      quote={replyDraft.quote}
                      setQuote={(v) => setReplyDraft({ ...replyDraft, quote: v })}
                      description={replyDraft.description}
                      setDescription={(v) => setReplyDraft({ ...replyDraft, description: v })}
                      isPending={createMutation.isPending}
                    />

                    <div className="mt-4 flex flex-col gap-6">
                      <EmotionSelector
                        extraEmotions={replyDraft.extraEmotions}
                        onToggle={(tag) => {
                          const next = replyDraft.extraEmotions.includes(tag)
                            ? replyDraft.extraEmotions.filter((t) => t !== tag)
                            : replyDraft.extraEmotions.length < 8
                              ? [...replyDraft.extraEmotions, tag]
                              : replyDraft.extraEmotions;
                          setReplyDraft({ ...replyDraft, extraEmotions: next });
                        }}
                      />
                      
                      <ActionPairRow
                        type="save-universe"
                        leftLabel="发送评论"
                        rightLabel="公开至星海"
                        onLeftClick={handleSaveReply}
                        onRightClick={() => {}}
                        isRightActive={replyDraft.visibilityIntent === "public"}
                        rightActiveLabel={replyDraft.visibilityIntent === "public" ? "星海可见" : "仅双方可见"}
                        isSwitched={replyDraft.visibilityIntent === "public"}
                        onSwitchToggle={(isP) => {
                          setReplyDraft({ ...replyDraft, visibilityIntent: isP ? "public" : "private" });
                        }}
                        isPending={createMutation.isPending}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>"""

new_panel = """            {/* Right Side: The Reply Panel */}
            <AnimatePresence>
              {isReplying && (
                <motion.div
                  initial={{ width: 0, opacity: 0, x: -20 }}
                  animate={{ width: 520, opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="overflow-hidden h-full flex-shrink-0"
                >
                  <div className="w-[520px] h-full flex flex-col rounded-[2.5rem] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-8 overflow-y-auto hide-scrollbar flex-1 relative flex flex-col">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 font-elysia-display flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-pink-500" />
                        回应这份心意
                      </h3>
                      
                      <MainInputCard
                        moodPhrase={replyDraft.moodPhrase}
                        setMoodPhrase={(v) => setReplyDraft({ ...replyDraft, moodPhrase: v })}
                        quote={replyDraft.quote}
                        setQuote={(v) => setReplyDraft({ ...replyDraft, quote: v })}
                        description={replyDraft.description}
                        setDescription={(v) => setReplyDraft({ ...replyDraft, description: v })}
                        isPending={createMutation.isPending}
                      />

                      <div className="mt-6 flex flex-col gap-8 flex-1 justify-end pb-2">
                        <EmotionSelector
                          extraEmotions={replyDraft.extraEmotions}
                          onToggle={(tag) => {
                            const next = replyDraft.extraEmotions.includes(tag)
                              ? replyDraft.extraEmotions.filter((t) => t !== tag)
                              : replyDraft.extraEmotions.length < 8
                                ? [...replyDraft.extraEmotions, tag]
                                : replyDraft.extraEmotions;
                            setReplyDraft({ ...replyDraft, extraEmotions: next });
                          }}
                        />
                        
                        <ActionPairRow
                          type="save-universe"
                          leftLabel="发送评论"
                          rightLabel="公开至星海"
                          onLeftClick={handleSaveReply}
                          onRightClick={() => {}}
                          isRightActive={replyDraft.visibilityIntent === "public"}
                          rightActiveLabel={replyDraft.visibilityIntent === "public" ? "星海可见" : "仅双方可见"}
                          isSwitched={replyDraft.visibilityIntent === "public"}
                          onSwitchToggle={(isP) => {
                            setReplyDraft({ ...replyDraft, visibilityIntent: isP ? "public" : "private" });
                          }}
                          isPending={createMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>"""

text = text.replace(old_panel, new_panel)

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "w", encoding="utf-8") as f:
    f.write(text)

