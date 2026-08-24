const fs = require('fs');
const path = require('path');

const modDir = 'C:\\Users\\Soujanya Bandari\\Desktop\\ihms\\backend\\src\\modules';
const dirs = fs.readdirSync(modDir);
dirs.forEach(d => {
  const fp = path.join(modDir, d);
  if (fs.statSync(fp).isDirectory()) {
    const files = fs.readdirSync(fp).filter(f => f.includes('controller'));
    files.forEach(f => {
      const content = fs.readFileSync(path.join(fp, f), 'utf8');
      const exports = content.match(/export const \w+/g);
      console.log(`${d}/${f} -> ${exports ? exports.join(', ') : 'no exports'}`);
    });
  }
});