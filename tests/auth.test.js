const request = require('supertest');
const app = require('../app');
const { pool } = require('./helpers/db');
const { seedWorld, api, login } = require('./helpers/seed');

let world;

beforeAll(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/login', () => {
  test('valid credentials return a token and the role', async () => {
    const res = await login('manager_a');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.role).toBe('manager');
  });

  test('wrong password → 401', async () => {
    const res = await login('manager_a', 'wrong-password');
    expect(res.status).toBe(401);
  });

  test('unknown username → 401 with the same message as a wrong password', async () => {
    const res = await login('nobody_here');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  test('missing password → 400', async () => {
    const res = await request(app).post('/api/login').send({ username: 'manager_a' });
    expect(res.status).toBe(400);
  });

  test('a successful login is recorded in login_logs', async () => {
    const count = async () => {
      const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM login_logs WHERE user_id = ?', [world.users.doctorA]);
      return row.n;
    };
    const before = await count();
    await login('doctor_a');
    expect(await count()).toBe(before + 1);
  });

  test('a deactivated user cannot log in → 403', async () => {
    const url = `/api/users/${world.users.receptionA}/status`;

    const off = await api(world.tokens.managerA).patch(url, { is_active: false });
    expect(off.status).toBe(200);
    expect((await login('reception_a')).status).toBe(403);

    // put things back so other tests are unaffected
    await api(world.tokens.managerA).patch(url, { is_active: true });
    expect((await login('reception_a')).status).toBe(200);
  });

  test('license kill-switch: an inactive clinic locks out its users → 403', async () => {
    const url = `/api/clinics/${world.clinicB.id}/status`;

    const off = await api(world.tokens.super).patch(url, { is_active: false });
    expect(off.status).toBe(200);

    const blocked = await login('manager_b');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/inactive/i);

    // the other clinic is not affected
    expect((await login('manager_a')).status).toBe(200);

    // restore
    await api(world.tokens.super).patch(url, { is_active: true });
    expect((await login('manager_b')).status).toBe(200);
  });
});

describe('authentication middleware', () => {
  test('no token → 401', async () => {
    const res = await request(app).get('/api/appointments');
    expect(res.status).toBe(401);
  });

  test('garbage token → 403', async () => {
    const res = await request(app).get('/api/appointments').set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(403);
  });
});
