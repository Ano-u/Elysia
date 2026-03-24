import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace selectedCard with openedCards array
content = re.sub(
    r'const \[selectedCard, setSelectedCard\] = useState<any \| null>\(null\);',
    r'const [openedCards, setOpenedCards] = useState<any[]>([]);\n  // To track which card we are replying to\n  const [replyingToId, setReplyingToId] = useState<string | null>(null);',
    content
)

# Replace instances of selectedCard usage with openedCards logic
# For createMutation
content = re.sub(
    r'mutationFn: \(data: any\) => createReply\(selectedCard\?\.id, data\),',
    r'mutationFn: (data: any) => createReply(replyingToId, data),',
    content
)

# For selectedCardRef
content = re.sub(
    r'const selectedCardRef = useRef<any \| null>\(null\);\n  useEffect\(\(\) => \{\n    selectedCardRef.current = selectedCard;\n  \}, \[selectedCard\]\);',
    r'const selectedCardRef = useRef<any[]>([]);\n  useEffect(() => {\n    selectedCardRef.current = openedCards;\n  }, [openedCards]);',
    content
)

# For scrolling check
content = re.sub(
    r'if \(selectedCardRef\.current\) return;',
    r'if (selectedCardRef.current.length > 0) return;',
    content
)

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
