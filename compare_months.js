const XLSX = require('xlsx');
const path = require('path');

function summarizeMonths() {
  const months = ['Jan 26.xlsx', 'Feb 26.xlsx', 'Mar 26.xlsx'];
  for (const m of months) {
    console.log(`\n=================== SUMMARY: ${m} ===================`);
    const wb = XLSX.readFile(path.join(__dirname, 'reference_files', m));
    const ws = wb.Sheets['Sheet1'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Look for Total rent row, Total expenses row, previous month bal, Total closing bal
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      const strRow = row.join(' ').toLowerCase();
      if (strRow.includes('total') || strRow.includes('balance') || strRow.includes('difference') || strRow.includes('actual expense')) {
        const clean = row.filter(c => c !== '').slice(0, 8);
        if (clean.length > 0) {
          console.log(`R${r+1}:`, clean);
        }
      }
    }
  }
}

summarizeMonths();
