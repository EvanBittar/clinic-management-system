const { pool } = require('./helpers/db');
const { seedWorld, api, login, PASSWORD } = require('./helpers/seed');

let world;
let t; // tokens

const newUser = (username, role) => ({ name: username, role, username, password: PASSWORD });

beforeAll(async () => {
  world = await seedWorld();
  t = world.tokens;
});

afterAll(async () => {
  await pool.end();
});

describe('users', () => {
  test('passwords are stored hashed and never returned', async () => {
    const res = await api(t.managerA).post('/api/users', newUser('hash_check', 'reception'));
    expect(res.status).toBe(201);
    expect(res.body.password).toBeUndefined();

    const [[row]] = await pool.query("SELECT password FROM users WHERE username = 'hash_check'");
    expect(row.password).not.toBe(PASSWORD);
    expect(row.password.startsWith('$2')).toBe(true); // a bcrypt hash
  });

  test('a username that is already taken → 409', async () => {
    const res = await api(t.managerA).post('/api/users', newUser('doctor_a', 'reception'));
    expect(res.status).toBe(409);
  });

  test('changing a password: the new one works and the old one stops working', async () => {
    const created = await api(t.managerA).post('/api/users', newUser('pw_change', 'reception'));
    expect(created.status).toBe(201);

    const updated = await api(t.managerA).put(`/api/users/${created.body.id}`, { password: 'BrandNew123' });
    expect(updated.status).toBe(200);

    expect((await login('pw_change', 'BrandNew123')).status).toBe(200);
    expect((await login('pw_change', PASSWORD)).status).toBe(401);
  });

  test('a password shorter than 6 characters → 400', async () => {
    const res = await api(t.managerA).put(`/api/users/${world.users.receptionA}`, { password: 'abc' });
    expect(res.status).toBe(400);
  });

  test('users can edit their own name', async () => {
    const res = await api(t.receptionA).put(`/api/users/${world.users.receptionA}`, { name: 'Reception A Updated' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Reception A Updated');
  });

  test('users cannot change their own role → 403', async () => {
    const res = await api(t.receptionA).put(`/api/users/${world.users.receptionA}`, { role: 'manager' });
    expect(res.status).toBe(403);
  });
});

describe('departments', () => {
  let tempDept; // a throwaway department, so renaming never disturbs the seeded "Dental A"

  beforeAll(async () => {
    const res = await api(t.managerA).post('/api/departments', { name: 'Temp Dept' });
    expect(res.status).toBe(201);
    tempDept = res.body.id;
  });

  test('a manager can rename a department → 200', async () => {
    const res = await api(t.managerA).put(`/api/departments/${tempDept}`, { name: 'Renamed By Manager' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed By Manager');
  });

  test('reception cannot rename a department → 403', async () => {
    const res = await api(t.receptionA).put(`/api/departments/${tempDept}`, { name: 'Nope' });
    expect(res.status).toBe(403);
  });

  test('an empty name → 400', async () => {
    const res = await api(t.managerA).put(`/api/departments/${tempDept}`, { name: '' });
    expect(res.status).toBe(400);
  });
});

describe('doctor profiles', () => {
  // These run in order: the department is moved and then moved back.
  test('the doctor list shows names, the department and the assistant, for this clinic only', async () => {
    const res = await api(t.receptionA).get('/api/doctors');
    expect(res.status).toBe(200);

    const doctor = res.body.find((d) => d.doctor_name === 'Doctor A');
    expect(doctor.department_name).toBe('Dental A');
    expect(doctor.assistant_user_id).toBe(world.users.assistantA);
    expect(res.body.some((d) => d.doctor_name === 'Doctor B')).toBe(false);
  });

  test('a manager can move a doctor to another department → 200', async () => {
    const dept = await api(t.managerA).post('/api/departments', { name: 'Skin A' });
    expect(dept.status).toBe(201);

    const res = await api(t.managerA).put(`/api/doctors/${world.doctorProfileA}`, { department_id: dept.body.id });
    expect(res.status).toBe(200);
    expect(res.body.department_id).toBe(dept.body.id);
    expect(res.body.department_name).toBe('Skin A');
  });

  test("another clinic's department → 400", async () => {
    const res = await api(t.managerA).put(`/api/doctors/${world.doctorProfileA}`, { department_id: world.deptB });
    expect(res.status).toBe(400);
  });

  test('the assistant must really be an assistant → 400', async () => {
    const res = await api(t.managerA).put(`/api/doctors/${world.doctorProfileA}`, { assistant_user_id: world.users.doctorA2 });
    expect(res.status).toBe(400);
  });

  test('a doctor can edit their own profile, but another doctor cannot', async () => {
    const own = await api(t.doctorA).put(`/api/doctors/${world.doctorProfileA}`, { department_id: world.deptA });
    expect(own.status).toBe(200);

    const other = await api(t.doctorA2).put(`/api/doctors/${world.doctorProfileA}`, { department_id: world.deptA });
    expect(other.status).toBe(403);
  });
});

describe('patients', () => {
  test('reception can update a patient, and the phone number becomes searchable', async () => {
    const res = await api(t.receptionA).put(`/api/patients/${world.patientA}`, {
      name: 'Patient A Renamed',
      phone: '+963 937 383 579',
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Patient A Renamed');
    expect(res.body.phone).toBe('+963 937 383 579');

    const found = await api(t.managerA).get('/api/patients?search=937');
    expect(found.body.map((p) => p.id)).toContain(world.patientA);
  });

  test('a phone number that is not a phone number → 400', async () => {
    const res = await api(t.receptionA).put(`/api/patients/${world.patientA}`, { phone: 'abc' });
    expect(res.status).toBe(400);
  });

  test('a doctor cannot update a patient → 403', async () => {
    const res = await api(t.doctorA).put(`/api/patients/${world.patientA}`, { name: 'Nope' });
    expect(res.status).toBe(403);
  });
});

describe('appointment types', () => {
  test("a manager can add a type, and the list only shows this clinic's types", async () => {
    const created = await api(t.managerA).post('/api/appointment-types', { name: 'Follow-up' });
    expect(created.status).toBe(201);
    expect(created.body.clinic_id).toBe(world.clinicA.id);

    const list = await api(t.managerA).get('/api/appointment-types');
    const names = list.body.map((x) => x.name);
    expect(names).toContain('Follow-up');
    expect(names).toContain('Checkup A');
    expect(names).not.toContain('Checkup B');
  });

  test('an empty name → 400', async () => {
    const res = await api(t.managerA).post('/api/appointment-types', { name: '' });
    expect(res.status).toBe(400);
  });
});

describe('clinics', () => {
  test('only the Super Admin can create a clinic', async () => {
    const asManager = await api(t.managerA).post('/api/clinics', { name: 'Sneaky Clinic', clinic_type_id: world.clinicTypeId });
    expect(asManager.status).toBe(403);

    const asSuper = await api(t.super).post('/api/clinics', { name: 'Clinic C', clinic_type_id: world.clinicTypeId });
    expect(asSuper.status).toBe(201);
    expect(asSuper.body.name).toBe('Clinic C');
  });

  test('a clinic needs a name and a valid type → 400', async () => {
    const noName = await api(t.super).post('/api/clinics', { clinic_type_id: world.clinicTypeId });
    expect(noName.status).toBe(400);

    const badType = await api(t.super).post('/api/clinics', { name: 'Clinic D', clinic_type_id: 'x' });
    expect(badType.status).toBe(400);
  });

  test('only the Super Admin can switch a clinic on or off, and the value must be a boolean', async () => {
    const url = `/api/clinics/${world.clinicA.id}/status`;
    expect((await api(t.managerA).patch(url, { is_active: false })).status).toBe(403);
    expect((await api(t.super).patch(url, { is_active: 'banana' })).status).toBe(400);
  });
});
