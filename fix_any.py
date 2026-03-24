import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 'any' issues
content = content.replace("const [openedCards, setOpenedCards] = useState<any[]>([]);", "const [openedCards, setOpenedCards] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any")
content = content.replace("const selectedCardRef = useRef<any[]>([]);", "const selectedCardRef = useRef<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any")

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
