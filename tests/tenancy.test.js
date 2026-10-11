const { pool } = require('./helpers/db');
const { seedWorld, api, PASSWORD } = require('./helpers/seed');

let world;
let t; // tokens
let apptA; // an appointment in clinic A
let apptB; // an appointment in clinic B

const apptBody = (patient, doctor, type) => ({
  patient_id: patient,
  doctor_id: doctor,
  appointment_type_id: type,
  scheduled_at: '2030-01-01T10:00:00',
});

beforeAll(async () => {
  world = await seedWorld();
  t = world.tokens;

  const a = await api(t.managerA).post('/api/appointments', apptBody(world.patientA, world.doctorProfileA, world.typeA));
  const b = await api(t.managerB).post('/api/appointments', apptBody(world.patientB, world.doctorProfileB, world.typeB));
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  apptA = a.body.id;
  apptB = b.body.id;
});

afterAll(async () => {
  await pool.end();
});

describe('manager A cannot attach clinic B data to a clinic A appointment', () => {
  test('patient from clinic B → 403', async () => {
    const res = await api(t.managerA).post('/api/appointments', apptBody(world.patientB, world.doctorProfileA, world.typeA));
    expect(res.status).toBe(403);
  });

  test('doctor from clinic B → 403', async () => {
    const res = await api(t.managerA).post('/api/appointments', apptBody(world.patientA, world.doctorProfileB, world.typeA));
    expect(res.status).toBe(403);
  });

  test('appointment type from clinic B → 403', async () => {
    const res = await api(t.managerA).post('/api/appointments', apptBody(world.patientA, world.doctorProfileA, world.typeB));
    expect(res.status).toBe(403);
  });

  test('a patient that does not exist → 404', async () => {
    const res = await api(t.managerA).post('/api/appointments', apptBody(999999, world.doctorProfileA, world.typeA));
    expect(res.status).toBe(404);
  });
});

describe('clinic_id sent in the request body is ignored', () => {
  test('when a manager creates a user', async () => {
    const res = await api(t.managerA).post('/api/users', {
      name: 'Sneaky',
      role: 'doctor',
      username: 'sneaky_doc',
      password: PASSWORD,
      clinic_id: world.clinicB.id, // trying to plant a user in clinic B
    });
    expect(res.status).toBe(201);
    expect(res.body.clinic_id).toBe(world.clinicA.id);
  });

  test('when a manager creates a department', async () => {
    const res = await api(t.managerA).post('/api/departments', { name: 'Laser', clinic_id: world.clinicB.id });
    expect(res.status).toBe(201);
    expect(res.body.clinic_id).toBe(world.clinicA.id);
  });
});

describe("lists only show the caller's own clinic", () => {
  test('appointments', async () => {
    const res = await api(t.managerA).get('/api/appointments');
    expect(res.status).toBe(200);
    const ids = res.body.map((a) => a.id);
    expect(ids).toContain(apptA);
    expect(ids).not.toContain(apptB);
  });

  test('patients, including search', async () => {
    const all = await api(t.managerA).get('/api/patients');
    const ids = all.body.map((p) => p.id);
    expect(ids).toContain(world.patientA);
    expect(ids).not.toContain(world.patientB);

    const found = await api(t.managerA).get('/api/patients?search=Patient');
    expect(found.body.map((p) => p.id)).toEqual([world.patientA]);
  });

  test('departments', async () => {
    const res = await api(t.managerA).get('/api/departments');
    const ids = res.body.map((d) => d.id);
    expect(ids).toContain(world.deptA);
    expect(ids).not.toContain(world.deptB);
  });
});

// For every attack we check TWO things: the status code AND that nothing changed.
describe("manager A cannot touch clinic B's records", () => {
  test('rename a department → 403, name unchanged', async () => {
    const res = await api(t.managerA).put(`/api/departments/${world.deptB}`, { name: 'Hacked' });
    expect(res.status).toBe(403);
    const [[row]] = await pool.query('SELECT name FROM departments WHERE id = ?', [world.deptB]);
    expect(row.name).toBe('Dental B');
  });

  test('deactivate a staff member → 403, still active', async () => {
    const res = await api(t.managerA).patch(`/api/users/${world.users.doctorB}/status`, { is_active: false });
    expect(res.status).toBe(403);
    const [[row]] = await pool.query('SELECT is_active FROM users WHERE id = ?', [world.users.doctorB]);
    expect(row.is_active).toBe(1);
  });

  test('edit a patient → 403, name unchanged', async () => {
    const res = await api(t.managerA).put(`/api/patients/${world.patientB}`, { name: 'Hacked' });
    expect(res.status).toBe(403);
    const [[row]] = await pool.query('SELECT name FROM patients WHERE id = ?', [world.patientB]);
    expect(row.name).toBe('Patient B');
  });

  test('read an appointment → 403', async () => {
    const res = await api(t.managerA).get(`/api/appointments/${apptB}`);
    expect(res.status).toBe(403);
  });

  test('change an appointment status → 403, status unchanged', async () => {
    const res = await api(t.managerA).patch(`/api/appointments/${apptB}/status`, { status: 'cancelled' });
    expect(res.status).toBe(403);
    const [[row]] = await pool.query('SELECT status FROM appointments WHERE id = ?', [apptB]);
    expect(row.status).toBe('new');
  });

  test("link clinic B's department to a clinic A doctor → 403", async () => {
    const res = await api(t.managerA).post('/api/doctors', {
      user_id: world.users.doctorA2,
      department_id: world.deptB,
    });
    expect(res.status).toBe(403);
  });
});
