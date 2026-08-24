const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const content = process.argv.slice(3).join(' ');

if (filePath) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Successfully wrote: ' + filePath);
}
