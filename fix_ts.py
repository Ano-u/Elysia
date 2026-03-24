import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the ts error by conditionally calling it with an empty string or bypassing it if it's null
content = content.replace(
    "mutationFn: (data: any) => createReply(replyingToId, data),",
    "mutationFn: (data: any) => createReply(replyingToId || '', data),"
)

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
