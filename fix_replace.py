import re

with open('apps/frontend/src/domains/universe/UniverseView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's find exactly what's failing the replacement by searching for the old text parts
match = content.find("              {/* Footer Author */}")
if match != -1:
    print(f"Found footer at {match}")
else:
    print("Could not find footer")

