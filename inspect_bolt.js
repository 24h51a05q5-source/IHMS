const fs = require('fs');
const path = require('path');

function walk(dir, level = 0) {
  if (level > 3) return;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === 'node_modules' || item === '.next' || item === '.bolt' || item === '.git') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    const indent = '  '.repeat(level);
    console.log(`${indent}${item}${stat.isDirectory() ? '/' : ''}`);
    if (stat.isDirectory()) {
      walk(full, level + 1);
    }
  }
}

console.log('=== APP DIRECTORY ===');
walk('c:\\Users\\Soujanya Bandari\\Desktop\\ihms\\project-bolt-sb1-7rfc89gr\\project\\app');
console.log('\n=== LIB DIRECTORY ===');
walk('c:\\Users\\Soujanya Bandari\\Desktop\\ihms\\project-bolt-sb1-7rfc89gr\\project\\lib');