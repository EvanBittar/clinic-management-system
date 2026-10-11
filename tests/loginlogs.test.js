const request = require('supertest');
const app = require('../app');
const { pool } = require('./helpers/db');
const { seedWorld, api, login } = require('./helpers/seed');

const URL = '/api/users/login-logs';

let world;
let t; // tokens

beforeAll(async () => {
  world = await seedWorld();
  t = world.tokens;
  // seedWorld logged doctor_a in once already; this is the second login
  await login('doctor_a');
});

afterAll(async () => {
  await pool.end();
});

describe('detailed view (every login)', () => {
  test("a manager sees today's logins of their own clinic only", async () => {
    const res = await api(t.managerA).get(URL);
    expect(res.status).toBe(200);

    const usernames = res.body.logs.map((l) => l.username);
    expect(usernames).toContain('manager_a');
    expect(usernames).toContain('doctor_a');
    expect(usernames).not.toContain('manager_b');
    expect(usernames).not.toContain('doctor_b');
    expect(usernames).not.toContain('superadmin');
    expect(res.body.logs.every((l) => l.clinic_id === world.clinicA.id)).toBe(true);
    expect(res.body.count).toBe(res.body.logs.length);
  });

  test("an explicit date works, and a day with no logins returns nothing", async () => {
    const [[{ d }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d");
    const today = await api(t.managerA).get(`${URL}?date=${d}`);
    expect(today.status).toBe(200);
    expect(today.body.count).toBeGreaterThan(0);

    const empty = await api(t.managerA).get(`${URL}?date=2000-01-01`);
    expect(empty.status).toBe(200);
    expect(empty.body.count).toBe(0);
    expect(empty.body.logs).toEqual([]);
  });
});

describe('summary view (who was here)', () => {
  test('one row per person, with how many times they logged in', async () => {
    const res = await api(t.managerA).get(`${URL}?view=summary`);
    expect(res.status).toBe(200);

    const rows = res.body.logs;
    const userIds = rows.map((r) => r.user_id);
    expect(new Set(userIds).size).toBe(userIds.length); // nobody appears twice

    const byUsername = Object.fromEntries(rows.map((r) => [r.username, r]));
    expect(byUsername.doctor_a.login_count).toBe(2);
    expect(byUsername.manager_a.login_count).toBe(1);
    expect(rows.every((r) => r.first_login <= r.last_login)).toBe(true);
  });

  test('the Super Admin sees every clinic', async () => {
    const res = await api(t.super).get(`${URL}?view=summary`);
    expect(res.status).toBe(200);
    const usernames = res.body.logs.map((r) => r.username);
    expect(usernames).toContain('manager_a');
    expect(usernames).toContain('manager_b');
    expect(usernames).toContain('superadmin');
  });
});

describe('access and validation', () => {
  test('a deputy manager can view it → 200', async () => {
    const res = await api(t.deputyA).get(URL);
    expect(res.status).toBe(200);
  });

  test('a doctor and reception cannot → 403', async () => {
    expect((await api(t.doctorA).get(URL)).status).toBe(403);
    expect((await api(t.receptionA).get(URL)).status).toBe(403);
  });

  test('no token → 401', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  test('a date that is not a date → 400', async () => {
    const res = await api(t.managerA).get(`${URL}?date=banana`);
    expect(res.status).toBe(400);
  });

  test('an unknown view → 400', async () => {
    const res = await api(t.managerA).get(`${URL}?view=weird`);
    expect(res.status).toBe(400);
  });
});
