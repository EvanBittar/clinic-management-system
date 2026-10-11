const request = require('supertest');
const app = require('../app');
const { pool } = require('./helpers/db');
const { seedWorld, api } = require('./helpers/seed');

let world;
let t; // tokens

beforeAll(async () => {
  world = await seedWorld();
  t = world.tokens;

  // Booking an appointment creates one notification for the doctor and one for the assistant
  const res = await api(t.managerA).post('/api/appointments', {
    patient_id: world.patientA,
    doctor_id: world.doctorProfileA,
    appointment_type_id: world.typeA,
    scheduled_at: '2030-01-01T10:00:00',
  });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/notifications', () => {
  test('you only ever see your own notifications', async () => {
    const mine = await api(t.doctorA).get('/api/notifications');
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    expect(mine.body.every((n) => n.user_id === world.users.doctorA)).toBe(true);
  });

  test("a user from another clinic sees none of them", async () => {
    const res = await api(t.doctorB).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('no token → 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/notifications/:id/read', () => {
  test('you can mark your own notification as read, and it is saved', async () => {
    const list = await api(t.doctorA).get('/api/notifications');
    const notification = list.body[0];
    expect(notification.is_read).toBe(0);

    const res = await api(t.doctorA).patch(`/api/notifications/${notification.id}/read`, {});
    expect(res.status).toBe(200);
    expect(res.body.is_read).toBe(true);

    const [[row]] = await pool.query('SELECT is_read FROM notifications WHERE id = ?', [notification.id]);
    expect(row.is_read).toBe(1);
  });

  test("you cannot mark someone else's notification → 403, and it stays unread", async () => {
    const assistantList = await api(t.assistantA).get('/api/notifications');
    const theirs = assistantList.body[0];

    const res = await api(t.doctorA).patch(`/api/notifications/${theirs.id}/read`, {});
    expect(res.status).toBe(403);

    const [[row]] = await pool.query('SELECT is_read FROM notifications WHERE id = ?', [theirs.id]);
    expect(row.is_read).toBe(0);
  });

  test('a notification that does not exist → 404', async () => {
    const res = await api(t.doctorA).patch('/api/notifications/999999/read', {});
    expect(res.status).toBe(404);
  });
});
