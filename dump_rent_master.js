const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

function extractRentMaster() {
  const wb = XLSX.readFile(path.join(__dirname, 'reference_files/Rent Details 2026.xlsx'));
  
  // Sheet1: Property/Partition/Rent records with terms & history
  const ws1 = wb.Sheets['Sheet1'];
  const s1Rows = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
  
  console.log('=== RENT DETAILS SHEET 1 ===');
  const sheet1Data = [];
  for (let r = 3; r < s1Rows.length; r++) {
    const row = s1Rows[r];
    if (row.some(c => c !== '')) {
      sheet1Data.push({
        rowNum: r + 1,
        sr: row[0],
        property: row[1],
        rentMonth: row[2],
        rentAnnum: row[3],
        deposit: row[4],
        terms: row[5],
        startFrom: row[6],
        col7: row[7]
      });
    }
  }
  console.log(`Sheet 1 non-empty rows: ${sheet1Data.length}`);
  fs.writeFileSync('rent_sheet1_dump.json', JSON.stringify(sheet1Data, null, 2));

  // Sheet2: Relational-style Rent Master table
  const ws2 = wb.Sheets['Sheet2'];
  const s2Rows = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
  console.log('=== RENT DETAILS SHEET 2 ===');
  const sheet2Data = [];
  for (let r = 2; r < s2Rows.length; r++) {
    const row = s2Rows[r];
    if (row.some(c => c !== '')) {
      sheet2Data.push({
        rowNum: r + 1,
        rentMasterId: row[0],
        propertyName: row[1],
        tenantName: row[2],
        rentTypeId: row[3],
        rentAmount: row[4],
        depositAmount: row[5],
        fromMonthId: row[6],
        toMonthId: row[7],
        comments: row[8]
      });
    }
  }
  console.log(`Sheet 2 non-empty rows: ${sheet2Data.length}`);
  fs.writeFileSync('rent_sheet2_dump.json', JSON.stringify(sheet2Data, null, 2));
}

extractRentMaster();
