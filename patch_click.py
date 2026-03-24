import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# For clicking a card in the universe
content = re.sub(
    r'onClick=\{\(\) => setSelectedCard\(card\)\}',
    r'onClick={() => setOpenedCards([card])}',
    content
)

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
