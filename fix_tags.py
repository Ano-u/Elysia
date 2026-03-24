import re

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# I messed up the closing tags because I removed the extra `div` level but didn't remove its closing tag!

old_footer_part = """                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>"""

new_footer_part = """                      </div>
                    </div>
                </motion.div>
              )}
            </AnimatePresence>"""

text = text.replace(old_footer_part, new_footer_part)

with open("apps/frontend/src/domains/universe/UniverseView.tsx", "w", encoding="utf-8") as f:
    f.write(text)

