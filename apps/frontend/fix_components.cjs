const fs = require('fs');

const inputPath = 'src/components/ui/ProgressiveInput.tsx';
let inputContent = fs.readFileSync(inputPath, 'utf8');

// Fix pointer events for group background and nudge
inputContent = inputContent.replace(
  'className="absolute inset-0 bg-white/40 dark:bg-black/20 rounded-2xl blur-xl transition-all duration-500 group-focus-within:bg-white/60 dark:group-focus-within:bg-white/10">',
  'className="absolute inset-0 bg-white/40 dark:bg-black/20 rounded-2xl blur-xl transition-all duration-500 group-focus-within:bg-white/60 dark:group-focus-within:bg-white/10 pointer-events-none">'
);

inputContent = inputContent.replace(
  'className="absolute -bottom-8 left-4 text-sm text-slate-500/70 dark:text-slate-400/70 italic flex items-center gap-2"',
  'className="absolute -bottom-8 left-4 text-sm text-slate-500/70 dark:text-slate-400/70 italic flex items-center gap-2 pointer-events-none"'
);

// Fix resize requestAnimationFrame
inputContent = inputContent.replace(
  'e.target.style.height = "auto";\n    e.target.style.height = `${Math.max(60, e.target.scrollHeight)}px`;',
  'const target = e.target;\n    requestAnimationFrame(() => {\n      target.style.height = "auto";\n      target.style.height = `${Math.max(60, target.scrollHeight)}px`;\n    });'
);

inputContent = inputContent.replace(
  'e.target.style.height = "auto";\n                      e.target.style.height = `${Math.max(24, e.target.scrollHeight)}px`;',
  'const target = e.target;\n                      requestAnimationFrame(() => {\n                        target.style.height = "auto";\n                        target.style.height = `${Math.max(24, target.scrollHeight)}px`;\n                      });'
);

// Extract emotions out of component to prevent recreate on render
if (!inputContent.includes('const EMOTIONS')) {
  const emotionsRegex = /const emotions = \[\s+{(?:[\s\S]*?)}\s+\];/m;
  const match = inputContent.match(emotionsRegex);
  if (match) {
    const emotionsDef = match[0].replace('const emotions =', 'const EMOTIONS =');
    inputContent = inputContent.replace(emotionsRegex, '');
    
    // Add imports and constant at top
    inputContent = inputContent.replace(
      'function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}',
      `function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n\n${emotionsDef}`
    );
    
    // Replace variable usage
    inputContent = inputContent.replace(/emotions\.map/g, 'EMOTIONS.map');
  }
}

// Fix missing shrink-0 on buttons
inputContent = inputContent.replace(
  'className={cn(\n                        "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 backdrop-blur-sm relative",',
  'className={cn(\n                        "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 backdrop-blur-sm relative shrink-0",'
);

fs.writeFileSync(inputPath, inputContent);
