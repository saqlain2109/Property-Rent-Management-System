const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../client/src');

let brokenCount = 0;

function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDir(fullPath);
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, lineNo) => {
        const importMatch = line.match(/from\s+['"](\.[^'"]+)['"]/);
        if (importMatch) {
          const relPath = importMatch[1];
          const resolvedBase = path.resolve(dir, relPath);
          const possible = [
            resolvedBase,
            resolvedBase + '.js',
            resolvedBase + '.jsx',
            resolvedBase + '.json',
            path.join(resolvedBase, 'index.js'),
            path.join(resolvedBase, 'index.jsx')
          ];
          const exists = possible.some(p => fs.existsSync(p));
          if (!exists) {
            console.error(`BROKEN IMPORT in ${path.basename(fullPath)} line ${lineNo + 1}: ${relPath}`);
            brokenCount++;
          }
        }
      });
    }
  }
}

checkDir(srcDir);
console.log(`Scan finished. Broken imports: ${brokenCount}`);
