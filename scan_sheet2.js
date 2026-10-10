const XLSX = require('xlsx');
const path = require('path');

function inspectSheet2() {
  const wb = XLSX.readFile(path.join(__dirname, 'reference_files', 'Jan 26.xlsx'));
  console.log('--- Jan 26 Sheet2 ---');
  const ws2 = wb.Sheets['Sheet2'];
  const data2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
  for (let r = 0; r < Math.min(25, data2.length); r++) {
    const row = data2[r];
    if (row.some(c => c !== '')) {
      console.log(`R${r+1}:`, row.slice(0, 10));
    }
  }

  console.log('\n--- Jan 26 Sheet1 Columns H to P (PG Table) ---');
  const ws1 = wb.Sheets['Sheet1'];
  const data1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
  for (let r = 3; r <= 15; r++) {
    const row = data1[r] || [];
    console.log(`R${r+1}:`, row.slice(7, 16));
  }
}

inspectSheet2();
