const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = [
  'reference_files/Rent Details 2026.xlsx',
  'reference_files/Jan 26.xlsx',
  'reference_files/Feb 26.xlsx',
  'reference_files/Mar 26.xlsx'
];

for (const f of files) {
  const filePath = path.join(__dirname, f);
  if (!fs.existsSync(filePath)) {
    console.log('File does not exist:', filePath);
    continue;
  }
  const wb = XLSX.readFile(filePath);
  console.log('====================================');
  console.log('FILE:', f);
  console.log('SHEETS:', wb.SheetNames);
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const ref = ws['!ref'];
    console.log(`  Sheet: "${sheetName}", Range: ${ref}`);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log(`  Total rows: ${rows.length}`);
    console.log('  Top 8 rows:');
    for (let i = 0; i < Math.min(8, rows.length); i++) {
      console.log(`    Row ${i + 1}:`, JSON.stringify(rows[i].slice(0, 15)));
    }
  }
}
