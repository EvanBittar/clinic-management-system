const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../app');
const { pool, resetDatabase } = require('./db');

const PASSWORD = 'Test12345!';

// Small wrapper so tests read like:  api(token).post('/api/users', { ... })
const api = (token) => {
  const auth = (req) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
  };
};

const login = (username, password = PASSWORD) =>
  request(app).post('/api/login').send({ username, password });

// Used only while seeding: fail loudly with the server's answer if a step breaks.
function must(res, status, label) {
  if (res.status !== status) {
    throw new Error(`Seed step "${label}" expected ${status} but got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function tokenFor(username) {
  return must(await login(username), 200, `login ${username}`).token;
}

/*
  Builds this world (everything except the clinic type and the Super Admin
  is created through the real API, so the real rules are exercised):

  Clinic A: manager_a, deputy_a, doctor_a (has a doctor profile + assistant_a as backup),
            doctor_a2 (user only, no profile yet), assistant_a, reception_a,
            department "Dental A", appointment type "Checkup A", "Patient A"
  Clinic B: manager_b, doctor_b (with doctor profile),
            department "Dental B", appointment type "Checkup B", "Patient B"
*/
async function seedWorld() {
  await resetDatabase();

  // 1. Two things that have no API on purpose: a clinic type and the platform Super Admin
  const [ct] = await pool.query("INSERT INTO clinic_types (name) VALUES ('General Clinic')");
  const hash = await bcrypt.hash(PASSWORD, 4);
  await pool.query(
    "INSERT INTO users (name, role, username, password, clinic_id) VALUES ('Super Admin', 'super_admin', 'superadmin', ?, NULL)",
    [hash]
  );
  const superToken = await tokenFor('superadmin');

  // 2. Two clinics
  const clinicA = must(await api(superToken).post('/api/clinics', { name: 'Clinic A', clinic_type_id: ct.insertId }), 201, 'clinic A');
  const clinicB = must(await api(superToken).post('/api/clinics', { name: 'Clinic B', clinic_type_id: ct.insertId }), 201, 'clinic B');

  const mkUser = async (token, data) =>
    must(await api(token).post('/api/users', { password: PASSWORD, ...data }), 201, `user ${data.username}`).id;

  // 3. A manager per clinic (created by the Super Admin)
  const users = {};
  users.managerA = await mkUser(superToken, { name: 'Manager A', role: 'manager', username: 'manager_a', clinic_id: clinicA.id });
  users.managerB = await mkUser(superToken, { name: 'Manager B', role: 'manager', username: 'manager_b', clinic_id: clinicB.id });
  const managerA = await tokenFor('manager_a');
  const managerB = await tokenFor('manager_b');

  // 4. Staff (created by each clinic's manager)
  users.deputyA = await mkUser(managerA, { name: 'Deputy A', role: 'deputy_manager', username: 'deputy_a' });
  users.doctorA = await mkUser(managerA, { name: 'Doctor A', role: 'doctor', username: 'doctor_a' });
  users.doctorA2 = await mkUser(managerA, { name: 'Doctor A2', role: 'doctor', username: 'doctor_a2' });
  users.assistantA = await mkUser(managerA, { name: 'Assistant A', role: 'assistant', username: 'assistant_a' });
  users.receptionA = await mkUser(managerA, { name: 'Reception A', role: 'reception', username: 'reception_a' });
  users.doctorB = await mkUser(managerB, { name: 'Doctor B', role: 'doctor', username: 'doctor_b' });

  // 5. Departments, appointment types, patients
  const deptA = must(await api(managerA).post('/api/departments', { name: 'Dental A' }), 201, 'department A').id;
  const deptB = must(await api(managerB).post('/api/departments', { name: 'Dental B' }), 201, 'department B').id;
  const typeA = must(await api(managerA).post('/api/appointment-types', { name: 'Checkup A' }), 201, 'type A').id;
  const typeB = must(await api(managerB).post('/api/appointment-types', { name: 'Checkup B' }), 201, 'type B').id;
  const receptionToken = await tokenFor('reception_a');
  const patientA = must(await api(receptionToken).post('/api/patients', { name: 'Patient A' }), 201, 'patient A').id;
  const patientB = must(await api(managerB).post('/api/patients', { name: 'Patient B' }), 201, 'patient B').id;

  // 6. Doctor profiles (link a doctor-role user to a department, plus a backup assistant)
  const doctorProfileA = must(
    await api(managerA).post('/api/doctors', { user_id: users.doctorA, department_id: deptA, assistant_user_id: users.assistantA }),
    201, 'doctor profile A'
  ).id;
  const doctorProfileB = must(
    await api(managerB).post('/api/doctors', { user_id: users.doctorB, department_id: deptB }),
    201, 'doctor profile B'
  ).id;

  // 7. A login token for everyone the tests need
  const tokens = { super: superToken, managerA, managerB, receptionA: receptionToken };
  const others = {
    deputyA: 'deputy_a',
    doctorA: 'doctor_a',
    doctorA2: 'doctor_a2',
    assistantA: 'assistant_a',
    doctorB: 'doctor_b',
  };
  for (const [key, username] of Object.entries(others)) {
    tokens[key] = await tokenFor(username);
  }

  return {
    clinicTypeId: ct.insertId,
    clinicA, clinicB, users, tokens,
    deptA, deptB, typeA, typeB, patientA, patientB, doctorProfileA, doctorProfileB,
  };
}

module.exports = { seedWorld, api, login, PASSWORD };
