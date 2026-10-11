const { pool } = require('./helpers/db');
const { seedWorld, api, PASSWORD } = require('./helpers/seed');

let world;
let t; // tokens

beforeAll(async () => {
  world = await seedWorld();
  t = world.tokens;
});

afterAll(async () => {
  await pool.end();
});

const newUser = (username, role, extra = {}) => ({ name: username, role, username, password: PASSWORD, ...extra });

describe('who can create which users', () => {
  test('super admin cannot create a doctor → 400', async () => {
    const res = await api(t.super).post('/api/users', newUser('sa_doctor', 'doctor', { clinic_id: world.clinicA.id }));
    expect(res.status).toBe(400);
  });

  test('super admin can create a manager → 201', async () => {
    const res = await api(t.super).post('/api/users', newUser('manager_a2', 'manager', { clinic_id: world.clinicA.id }));
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('manager');
    expect(res.body.clinic_id).toBe(world.clinicA.id);
  });

  test('manager can create a deputy manager → 201', async () => {
    const res = await api(t.managerA).post('/api/users', newUser('deputy_a2', 'deputy_manager'));
    expect(res.status).toBe(201);
  });

  test('deputy manager cannot create another deputy → 400, nothing created', async () => {
    const res = await api(t.deputyA).post('/api/users', newUser('deputy_blocked', 'deputy_manager'));
    expect(res.status).toBe(400);
    const [[row]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE username = 'deputy_blocked'");
    expect(row.n).toBe(0);
  });

  test('deputy manager can create reception staff → 201', async () => {
    const res = await api(t.deputyA).post('/api/users', newUser('reception_by_deputy', 'reception'));
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('reception');
  });

  test('a doctor cannot create users at all → 403', async () => {
    const res = await api(t.doctorA).post('/api/users', newUser('doc_made_user', 'reception'));
    expect(res.status).toBe(403);
  });
});

describe('patients', () => {
  test('reception can create a patient with just a name → 201', async () => {
    const res = await api(t.receptionA).post('/api/patients', { name: 'Walk-in Patient' });
    expect(res.status).toBe(201);
    expect(res.body.clinic_id).toBe(world.clinicA.id);
  });

  test('a doctor cannot create a patient → 403', async () => {
    const res = await api(t.doctorA).post('/api/patients', { name: 'Nope' });
    expect(res.status).toBe(403);
  });

  test("an assistant cannot create a patient → 403", async () => {
    const res = await api(t.assistantA).post('/api/patients', { name: 'Nope' });
    expect(res.status).toBe(403);
  });

  test('an empty name → 400', async () => {
    const res = await api(t.receptionA).post('/api/patients', { name: '' });
    expect(res.status).toBe(400);
  });

  test('an invalid date of birth → 400', async () => {
    const res = await api(t.receptionA).post('/api/patients', { name: 'Bad DOB', date_of_birth: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});

describe('departments', () => {
  test('super admin cannot create a department → 403', async () => {
    const res = await api(t.super).post('/api/departments', { name: 'Nope' });
    expect(res.status).toBe(403);
  });

  test('reception cannot create a department → 403', async () => {
    const res = await api(t.receptionA).post('/api/departments', { name: 'Nope' });
    expect(res.status).toBe(403);
  });

  test('manager can create a department → 201', async () => {
    const res = await api(t.managerA).post('/api/departments', { name: 'Skin Care' });
    expect(res.status).toBe(201);
  });
});

describe('updating and deactivating users', () => {
  test('manager can rename a doctor → 200', async () => {
    const res = await api(t.managerA).put(`/api/users/${world.users.doctorA2}`, { name: 'Doctor A2 Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Doctor A2 Renamed');
  });

  test("a doctor cannot edit another doctor → 403", async () => {
    const res = await api(t.doctorA).put(`/api/users/${world.users.doctorA2}`, { name: 'Hacked' });
    expect(res.status).toBe(403);
  });

  test('deputy cannot promote someone to manager → 400', async () => {
    const res = await api(t.deputyA).put(`/api/users/${world.users.receptionA}`, { role: 'manager' });
    expect(res.status).toBe(400);
  });

  test('manager cannot assign the manager role → 400', async () => {
    const res = await api(t.managerA).put(`/api/users/${world.users.receptionA}`, { role: 'manager' });
    expect(res.status).toBe(400);
  });

  test('a manager cannot deactivate their own account → 400', async () => {
    const res = await api(t.managerA).patch(`/api/users/${world.users.managerA}/status`, { is_active: false });
    expect(res.status).toBe(400);
  });

  test('a deputy cannot deactivate the manager → 403', async () => {
    const res = await api(t.deputyA).patch(`/api/users/${world.users.managerA}/status`, { is_active: false });
    expect(res.status).toBe(403);
  });

  test('a doctor cannot deactivate anyone → 403', async () => {
    const res = await api(t.doctorA).patch(`/api/users/${world.users.receptionA}/status`, { is_active: false });
    expect(res.status).toBe(403);
  });
});

describe('creating doctor profiles', () => {
  test('an assistant-role user cannot be linked as the doctor → 400', async () => {
    const res = await api(t.managerA).post('/api/doctors', { user_id: world.users.assistantA, department_id: world.deptA });
    expect(res.status).toBe(400);
  });

  test('the same doctor cannot be registered twice → 409', async () => {
    const res = await api(t.managerA).post('/api/doctors', { user_id: world.users.doctorA, department_id: world.deptA });
    expect(res.status).toBe(409);
  });

  test('a user that does not exist → 404', async () => {
    const res = await api(t.managerA).post('/api/doctors', { user_id: 999999, department_id: world.deptA });
    expect(res.status).toBe(404);
  });

  test("a user from another clinic → 403", async () => {
    const res = await api(t.managerA).post('/api/doctors', { user_id: world.users.doctorB, department_id: world.deptA });
    expect(res.status).toBe(403);
  });
});
