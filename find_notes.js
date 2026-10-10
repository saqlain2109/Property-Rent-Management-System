const fs = require('fs');
const path = require('path');

function searchWordInFolder(folder) {
  const files = fs.readdirSync(folder);
  for (const f of files) {
    if (f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.json')) {
      const full = path.join(folder, f);
      const content = fs.readFileSync(full, 'utf8');
      if (content.toLowerCase().includes('meeting') || content.toLowerCase().includes('rent') || content.toLowerCase().includes('kotak')) {
        console.log('Match in:', f);
      }
    }
  }
}

searchWordInFolder(__dirname);
