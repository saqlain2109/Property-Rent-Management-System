const XLSX = require('xlsx');
const path = require('path');

function printRestOfJan() {
  const wb = XLSX.readFile(path.join(__dirname, 'reference_files', 'Jan 26.xlsx'));
  const ws = wb.Sheets['Sheet1'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  console.log('--- Jan 26 Rows 101 to 160 ---');
  for (let r = 100; r < Math.min(160, data.length); r++) {
    const row = data[r];
    if (row.some(c => c !== '')) {
      const line = row.slice(0, 15).map(c => typeof c === 'string' ? c.replace(/\n/g, ' ') : c);
      console.log(`R${r+1}:`, JSON.stringify(line));
    }
  }
}

printRestOfJan();
