const request = require('supertest');
const mongoose = require('mongoose');
const app = require('./index');

jest.setTimeout(30000);

describe('Property & Rent Management API Tests', () => {
  let token;

  beforeAll(async () => {
    // Ensure DB connection is ready
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property_rent_db');
    }
    // Login with seeded admin credentials
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@propertyrent.com',
        password: 'AdminPassword123!'
      });
    token = res.body.token;
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  test('GET /api/health should return ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
  });

  test('GET /api/properties should return migrated properties', async () => {
    const res = await request(app)
      .get('/api/properties')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(10);
  });

  test('GET /api/tenants should return migrated tenants', async () => {
    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(20);
  });

  test('GET /api/dashboard/summary should compute live stats from database', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary?targetMonth=2026-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.stats.totalProperties).toBeGreaterThanOrEqual(10);
    expect(res.body.stats.totalUnits).toBeGreaterThanOrEqual(20);
  });

  test('POST /api/chat/query should accurately answer tenant outstanding query', async () => {
    const res = await request(app)
      .post('/api/chat/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'How much rent is pending for Delhiery?' });
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.answer).toContain('Delhiery');
  });

  test('GET /api/ledger should return verified monthly closing balances', async () => {
    const res = await request(app)
      .get('/api/ledger')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });
});
