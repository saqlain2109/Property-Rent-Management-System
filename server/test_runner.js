const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const app = require('./index');

async function runStandaloneTests() {
  console.log('[Test Suite] Starting tests against running MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property_rent_db');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5099, resolve));
  const baseUrl = 'http://127.0.0.1:5099';

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  let passed = 0;
  let failed = 0;

  async function assert(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. Health check
  await assert('Health Check GET /api/health', async () => {
    const res = await request('/api/health');
    if (res.status !== 200 || res.body.status !== 'ok') throw new Error(`Status ${res.status}`);
  });

  // 2. Auth login
  let token = '';
  await assert('Admin Login POST /api/auth/login', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'admin@propertyrent.com', password: 'AdminPassword123!' }
    });
    if (res.status !== 200 || !res.body.token) throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
    token = res.body.token;
  });

  await assert('Admin Username Login POST /api/auth/login', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'admin', password: 'AdminPassword123!' }
    });
    if (res.status !== 200 || !res.body.token || res.body.user.username !== 'admin') {
      throw new Error(`Username login failed: ${JSON.stringify(res.body)}`);
    }
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 3. Properties check
  await assert('List Properties GET /api/properties (migrated 10+ properties)', async () => {
    const res = await request('/api/properties', { headers: authHeaders });
    if (res.status !== 200 || res.body.data.length < 10) throw new Error(`Found ${res.body.data?.length} properties`);
  });

  // 4. Units check
  await assert('List Units GET /api/units (migrated 25 units)', async () => {
    const res = await request('/api/units', { headers: authHeaders });
    if (res.status !== 200 || res.body.data.length < 20) throw new Error(`Found ${res.body.data?.length} units`);
  });

  // 5. Tenants check
  await assert('List Tenants GET /api/tenants (migrated 25 tenants)', async () => {
    const res = await request('/api/tenants', { headers: authHeaders });
    if (res.status !== 200 || res.body.data.length < 20) throw new Error(`Found ${res.body.data?.length} tenants`);
  });

  // 6. Dashboard live summary
  await assert('Live Dashboard Summary GET /api/dashboard/summary?targetMonth=2026-01', async () => {
    const res = await request('/api/dashboard/summary?targetMonth=2026-01', { headers: authHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const stats = res.body.stats;
    if (stats.totalProperties !== 10 || stats.currentMonthCollected !== 506050) {
      throw new Error(`Expected Jan collection 506050, got ${stats.currentMonthCollected}`);
    }
  });

  // 7. Monthly Ledger verification against Excel
  await assert('Monthly Ledger GET /api/ledger (Jan closing 6,135,568.74, Feb 6,510,768.74)', async () => {
    const res = await request('/api/ledger', { headers: authHeaders });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const jan = res.body.data.find(d => d.monthYear === '2026-01');
    const feb = res.body.data.find(d => d.monthYear === '2026-02');
    if (!jan || Math.abs(jan.closingBalance - 6135568.74) > 1) {
      throw new Error(`Jan closing mismatch: ${jan?.closingBalance}`);
    }
    if (!feb || Math.abs(feb.closingBalance - 6510768.74) > 1) {
      throw new Error(`Feb closing mismatch: ${feb?.closingBalance}`);
    }
  });

  // 8. Smart Chatbot Query
  await assert('Smart Assistant Chatbot POST /api/chat/query for Delhiery rent', async () => {
    const res = await request('/api/chat/query', {
      method: 'POST',
      headers: authHeaders,
      body: { query: 'How much rent is pending for Delhiery?' }
    });
    if (res.status !== 200 || !res.body.answer.includes('Delhiery')) {
      throw new Error(`Chatbot error: ${JSON.stringify(res.body)}`);
    }
  });

  // 9. PG Settlements
  await assert('PG Settlements GET /api/pg-settlements', async () => {
    const res = await request('/api/pg-settlements', { headers: authHeaders });
    if (res.status !== 200 || res.body.data.length < 4) throw new Error(`Found ${res.body.data?.length} PG settlements`);
  });

  console.log(`\n[Test Results] Passed: ${passed}, Failed: ${failed}`);
  server.close();
  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
}

runStandaloneTests().catch(err => {
  console.error('[Fatal Test Error]', err);
  process.exit(1);
});
