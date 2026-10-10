const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function inspectDetailed() {
  const rentDetailsFile = path.join(__dirname, 'reference_files/Rent Details 2026.xlsx');
  const wbRent = XLSX.readFile(rentDetailsFile);
  
  console.log('--- Rent Details Sheet1 ---');
  const ws1 = wbRent.Sheets['Sheet1'];
  const data1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
  for (let r = 0; r < Math.min(35, data1.length); r++) {
    const row = data1[r];
    if (row.some(c => c !== '')) {
      console.log(`R${r+1}:`, row.slice(0, 10).map(c => String(c).trim()));
    }
  }

  console.log('\n--- Rent Details Sheet2 ---');
  const ws2 = wbRent.Sheets['Sheet2'];
  const data2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
  for (let r = 0; r < Math.min(30, data2.length); r++) {
    const row = data2[r];
    if (row.some(c => c !== '')) {
      console.log(`R${r+1}:`, row.slice(0, 10).map(c => String(c).trim()));
    }
  }

  console.log('\n--- Jan 26 Sheet1 Layout ---');
  const wbJan = XLSX.readFile(path.join(__dirname, 'reference_files/Jan 26.xlsx'));
  const wsJan1 = wbJan.Sheets['Sheet1'];
  const dataJan1 = XLSX.utils.sheet_to_json(wsJan1, { header: 1, defval: '' });
  for (let r = 0; r < Math.min(35, dataJan1.length); r++) {
    const row = dataJan1[r];
    if (row.some(c => c !== '')) {
      console.log(`Jan R${r+1}:`, row.slice(0, 16).map(c => String(c).trim()));
    }
  }
}

inspectDetailed();
