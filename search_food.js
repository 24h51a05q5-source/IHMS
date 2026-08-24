const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === 'node_modules' || item === '.next' || item === 'dist' || item === '.git') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      searchDir(full);
    } else if (/\.(ts|tsx|js|json)$/.test(item)) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('Idli') || content.includes('Sambar') || content.includes('Dal Tadka')) {
        console.log('Found in:', full);
      }
    }
  }
}

searchDir('C:\\Users\\Soujanya Bandari\\Desktop\\ihms\\backend');
searchDir('C:\\Users\\Soujanya Bandari\\Desktop\\ihms\\frontend');