const fs = require('fs');
const path = require('path');

const apiDir = 'c:\\Users\\Soujanya Bandari\\Desktop\\ihms\\project-bolt-sb1-7rfc89gr\\project\\lib\\api';
const files = fs.readdirSync(apiDir);
files.forEach(f => {
  const content = fs.readFileSync(path.join(apiDir, f), 'utf8');
  console.log(`=== ${f} ===`);
  const lines = content.split('\n').filter(l => l.includes('api.') || l.includes('export const'));
  console.log(lines.slice(0, 10).join('\n'));
});