const http = require('http');

function apiCall(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method,
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSinglePass(passNumber) {
  console.log(`\n=================== START TEST RUN ${passNumber} ===================`);
  
  // 1. Login
  const login = await apiCall('POST', '/auth/login', { username: 'admin', password: 'AdminPassword123!' });
  if (login.status !== 200 || !login.data.token) {
    throw new Error(`Login failed on pass ${passNumber}`);
  }
  const token = login.data.token;
  console.log(`[Pass ${passNumber}] Auth OK: Token acquired.`);

  // 2. Core Master Data APIs
  const [props, units, tenants, assigns] = await Promise.all([
    apiCall('GET', '/properties', null, token),
    apiCall('GET', '/units', null, token),
    apiCall('GET', '/tenants', null, token),
    apiCall('GET', '/assignments', null, token)
  ]);

  if (props.status !== 200 || units.status !== 200 || tenants.status !== 200 || assigns.status !== 200) {
    throw new Error(`Master fetch failed: props=${props.status}, units=${units.status}, tenants=${tenants.status}, assigns=${assigns.status}`);
  }
  console.log(`[Pass ${passNumber}] Master Data APIs OK: ${props.data.data.length} Properties, ${units.data.data.length} Units, ${tenants.data.data.length} Tenants, ${assigns.data.data.length} Contracts.`);

  // 3. Payments and Reports APIs
  const [payments, outSummary, expenses, categories, ledger] = await Promise.all([
    apiCall('GET', '/payments', null, token),
    apiCall('GET', '/payments/outstanding-summary?upToMonthYear=2026-10', null, token),
    apiCall('GET', '/expenses?month=2026-10', null, token),
    apiCall('GET', '/expenses/categories', null, token),
    apiCall('GET', '/ledger?startMonth=2026-10&endMonth=2026-10', null, token)
  ]);

  if (payments.status !== 200 || outSummary.status !== 200) {
    throw new Error(`Payments/Summary failed: payments=${payments.status}, summary=${outSummary.status}`);
  }
  console.log(`[Pass ${passNumber}] Payments & Reports APIs OK: ${payments.data.data.length} Payments, ${outSummary.data.data.length} Outstanding Units, ${expenses.data.data.length} Expenses.`);

  // 4. Drilldown Verification: REC-2526-00039 (DG Cable)
  const rec39 = payments.data.data.find(p => p.receiptNumber === 'REC-2526-00039');
  if (!rec39) throw new Error('REC-2526-00039 not found in payments!');
  
  const rec39Detail = await apiCall('GET', `/payments/${rec39._id}`, null, token);
  if (rec39Detail.status !== 200) throw new Error('Single payment fetch failed for REC-2526-00039');
  
  const dgTenantId = rec39Detail.data.data.tenantId?._id || rec39Detail.data.data.tenantId;
  const dgUnitId = rec39Detail.data.data.unitId?._id || rec39Detail.data.data.unitId;
  const dgContract = rec39Detail.data.data.contractNo;

  if (rec39Detail.data.data.rentAmount !== 25000) {
    throw new Error(`REC-2526-00039 rentAmount is ${rec39Detail.data.data.rentAmount}, expected 25000`);
  }
  if (dgContract !== 'DG-2025') {
    throw new Error(`REC-2526-00039 contractNo is ${dgContract}, expected DG-2025`);
  }

  // Verify Ledger for DG Cable
  const dgLedger = await apiCall('GET', `/payments/tenant-unit-ledger?tenantId=${dgTenantId}&unitId=${dgUnitId}&upToMonthYear=2025-06`, null, token);
  if (dgLedger.status !== 200) throw new Error('Ledger fetch failed for DG Cable');
  const dg04 = dgLedger.data.data.monthsBreakdown.find(m => m.monthYear === '2025-04');
  if (!dg04 || dg04.expectedRate !== 25000) {
    throw new Error(`DG Cable expectedRate for 2025-04 is ${dg04?.expectedRate}, expected 25000`);
  }
  console.log(`[Pass ${passNumber}] Verified REC-2526-00039 drilldown values: Rent Amount = 25000, Contract = ${dgContract}, Ledger 2025-04 Expected = ${dg04.expectedRate}`);

  // 5. Verify other major contracts drilldown (DE-2025, PG-2018, WaterWala-2018)
  const testContracts = ['DE-2025', 'PG-2018', 'WaterWala-2018'];
  for (const cNo of testContracts) {
    const asg = assigns.data.data.find(a => (a.contractNo || '').toLowerCase() === cNo.toLowerCase());
    if (asg) {
      const cReceipts = await apiCall('GET', `/payments?tenantId=${asg.tenantId?._id}&unitId=${asg.unitId?._id}&contractNo=${encodeURIComponent(asg.contractNo)}`, null, token);
      console.log(`[Pass ${passNumber}] Contract ${cNo}: found ${cReceipts.data.data.length} receipts, current monthly rate = ${asg.currentMonthlyRate}`);
    }
  }

  console.log(`=================== PASSED TEST RUN ${passNumber} ===================\n`);
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    await runSinglePass(i);
  }
  console.log('ALL 3 TEST PASSES COMPLETED WITH 100% SUCCESS!');
  process.exit(0);
}

main().catch(err => {
  console.error('TEST RUN FAILURE:', err);
  process.exit(1);
});
