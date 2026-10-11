const http = require('http');
const { io: connect } = require('socket.io-client');
const app = require('../app');
const { pool } = require('./helpers/db');
const { seedWorld, api } = require('./helpers/seed');
const { initRealtime } = require('../services/realtime');

let world;
let server;
let rt;
let url;
const sockets = [];

// Open a socket the way the React app will: sending the JWT in `auth`
const open = (token) =>
  new Promise((resolve, reject) => {
    const socket = connect(url, { auth: { token }, reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

const listen = (socket) => {
  const received = [];
  socket.on('notification', (n) => received.push(n));
  return received;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, timeout = 3000) {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await wait(20);
  }
}

beforeAll(async () => {
  world = await seedWorld();
  server = http.createServer(app);
  rt = initRealtime(server);
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await new Promise((resolve) => rt.close(resolve)); // also closes the http server
  await pool.end();
});

describe('live notifications', () => {
  test('a new appointment is pushed to the doctor and the assistant, and to nobody else', async () => {
    const t = world.tokens;
    const doctor = await open(t.doctorA);
    const assistant = await open(t.assistantA);
    const reception = await open(t.receptionA);
    const otherClinicDoctor = await open(t.doctorB);

    const doctorGot = listen(doctor);
    const assistantGot = listen(assistant);
    const receptionGot = listen(reception);
    const otherGot = listen(otherClinicDoctor);

    const res = await api(t.managerA).post('/api/appointments', {
      patient_id: world.patientA,
      doctor_id: world.doctorProfileA,
      appointment_type_id: world.typeA,
      scheduled_at: '2030-01-01T10:00:00',
    });
    expect(res.status).toBe(201);

    await waitFor(() => doctorGot.length > 0 && assistantGot.length > 0);
    await wait(300); // give any wrong delivery time to show up

    expect(doctorGot).toHaveLength(1);
    expect(doctorGot[0].type).toBe('new_appointment');
    expect(doctorGot[0].user_id).toBe(world.users.doctorA);
    expect(doctorGot[0].appointment_id).toBe(res.body.id);

    expect(assistantGot).toHaveLength(1);
    expect(assistantGot[0].user_id).toBe(world.users.assistantA);

    expect(receptionGot).toHaveLength(0);
    expect(otherGot).toHaveLength(0);
  });

  test('a socket without a valid token is rejected', async () => {
    await expect(open(undefined)).rejects.toThrow('no token');
    await expect(open('garbage')).rejects.toThrow('invalid token');
  });
});
