const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, 'reference_files', 'Mar 26.xlsx'));
const ws = wb.Sheets['Sheet1'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('--- Mar 26 Expenses (Rows 44 to 110) ---');
for (let r = 44; r <= 109; r++) {
  const row = data[r] || [];
  if (row.some(c => c !== '')) {
    console.log(`[R${r+1}]`, row.slice(0, 8).map(c => typeof c === 'string' ? c.trim() : c));
  }
}
