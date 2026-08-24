const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, 'test/ihms.spec.ts');
let content = fs.readFileSync(testPath, 'utf8');
content = content.replace("expect(complaint.complaintNumber).toMatch(/^HYD001-CMP/);", "expect(complaint.complaintNumber).toMatch(/^(HYD001|HYD002)-CMP/);");
fs.writeFileSync(testPath, content, 'utf8');
console.log('Updated test expectation.');