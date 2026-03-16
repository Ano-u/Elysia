const fs = require('fs');

const file1 = 'src/domains/universe/UniverseView.tsx';
let content1 = fs.readFileSync(file1, 'utf8');
content1 = content1.replace('setFocusIndices(topIndices);', 
  'setFocusIndices((prev) => {\n        if (prev.length === topIndices.length && prev.every((v, i) => v === topIndices[i])) return prev;\n        return topIndices;\n      });');
fs.writeFileSync(file1, content1);

const file2 = 'src/domains/mindmap/MindMapView.tsx';
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace('setNodes([...simulationNodes]);', 'setNodes(simulationNodes.slice());');
content2 = content2.replace('setLinks([...simulationLinks]);', 'setLinks(simulationLinks.slice());');
fs.writeFileSync(file2, content2);
