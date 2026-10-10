const XLSX = require('xlsx');
const path = require('path');

function inspectExpensesComparison() {
  const months = ['Jan 26.xlsx', 'Feb 26.xlsx', 'Mar 26.xlsx'];
  for (const m of months) {
    console.log(`\n=================== EXPENSES: ${m} ===================`);
    const wb = XLSX.readFile(path.join(__dirname, 'reference_files', m));
    const ws = wb.Sheets['Sheet1'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // Rows 44 to 106
    for (let r = 44; r <= 106; r++) {
      const row = data[r] || [];
      const code = row[1];
      const desc = row[2];
      const amount = row[3];
      const remarks = row[4];
      if (amount || (desc && desc.trim())) {
        console.log(`[R${r+1}] Code: "${code}" | Item: "${desc}" | Amount: "${amount}" | Remarks: "${remarks}"`);
      }
    }
  }
}

inspectExpensesComparison();
