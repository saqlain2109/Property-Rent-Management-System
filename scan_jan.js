const XLSX = require('xlsx');
const path = require('path');

function analyzeFile(filename) {
  console.log(`\n=================== ${filename} ===================`);
  const wb = XLSX.readFile(path.join(__dirname, 'reference_files', filename));
  const ws = wb.Sheets['Sheet1'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  console.log(`Total non-empty rows count approx:`, data.filter(r => r.some(c => c !== '')).length);
  
  // Print all rows with index
  for (let r = 0; r < Math.min(100, data.length); r++) {
    const row = data[r];
    if (row.some(c => c !== '')) {
      const line = row.slice(0, 15).map(c => typeof c === 'string' ? c.replace(/\n/g, ' ') : c);
      console.log(`R${r+1}:`, JSON.stringify(line));
    }
  }
}

analyzeFile('Jan 26.xlsx');
