const XLSX = require('xlsx');
const path = require('path');

function inspectRentalComparison() {
  const months = ['Jan 26.xlsx', 'Feb 26.xlsx', 'Mar 26.xlsx'];
  for (const m of months) {
    console.log(`\n=================== RENTAL SECTION: ${m} ===================`);
    const wb = XLSX.readFile(path.join(__dirname, 'reference_files', m));
    const ws = wb.Sheets['Sheet1'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // Rows 4 to 43 are the rent section
    for (let r = 3; r <= 42; r++) {
      const row = data[r] || [];
      const code = row[1];
      const name = row[2];
      const amount = row[3];
      const comments = row[5];
      if (name || amount || comments) {
        console.log(`[R${r+1}] Code: "${code}" | Name: "${name}" | Recvd: "${amount}" | Comments: "${comments}"`);
      }
    }
  }
}

inspectRentalComparison();
