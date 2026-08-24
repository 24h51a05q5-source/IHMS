const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, 'backend/src/seed.ts');
let content = fs.readFileSync(seedPath, 'utf8');

content = content.replace(
  "await disconnectDatabase();",
  "// Disconnect only if called as standalone script\n  if (require.main === module) { await disconnectDatabase(); }"
);

fs.writeFileSync(seedPath, content, 'utf8');
console.log('Fixed seed.ts disconnect check.');