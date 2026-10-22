const xlsx = require('xlsx');
const path = require('path');

const files = ['Jan 26.xlsx', 'Feb 26.xlsx', 'Mar 26.xlsx'];

files.forEach(filename => {
  console.log('===============================================================');
  console.log('FILE:', filename);
  const filePath = path.join(__dirname, '../../reference_files', filename);
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets['Sheet1'];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  for (let r = 0; r <= 42; r++) {
    const row = rows[r];
    if (row && row.some(cell => cell !== null && cell !== '')) {
      console.log('R' + r + ':', JSON.stringify(row));
    }
  }
});
