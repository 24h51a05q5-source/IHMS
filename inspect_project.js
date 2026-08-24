const fs = require('fs');
const path = require('path');

function searchPatterns(dir, patterns) {
  let results = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (file.name !== 'node_modules' && file.name !== '.next' && file.name !== 'dist' && file.name !== '.git') {
        results = results.concat(searchPatterns(fullPath, patterns));
      }
    } else if (file.isFile() && (file.name.endsWith('.ts') || file.name.endsWith('.tsx') || file.name.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      patterns.forEach(p => {
        const regex = new RegExp(p, 'gi');
        let match;
        while ((match = regex.exec(content)) !== null) {
          results.push({ file: fullPath, pattern: p, line: content.substring(0, match.index).split('\n').length });
        }
      });
    }
  }
  return results;
}

const suspiciousWords = ['mock', 'dummy', 'fake', 'staticData', 'mockData', 'setTimeout'];
const rootDir = path.join(__dirname, '.');
const found = searchPatterns(rootDir, suspiciousWords);
console.log('--- SUSPICIOUS / MOCK PATTERNS FOUND ---');
found.forEach(f => console.log(`${f.file}:${f.line} -> ${f.pattern}`));
if (found.length === 0) console.log('Zero mock/dummy patterns found!');