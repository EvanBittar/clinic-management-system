const { pool } = require('./helpers/db');
const { seedWorld, api } = require('./helpers/seed');

let world;
let t; // tokens

const booking = (overrides = {}) => ({
  patient_id: world.patientA,
  doctor_id: world.doctorProfileA,
  appointment_type_id: world.typeA,
  scheduled_at: '2030-03-01T10:00:00',
  ...overrides,
});

// Book through the real API and return the new appointment's id
const book = async (token, overrides) => {
  const res = await api(token).post('/api/appointments', booking(overrides));
  expect(res.status).toBe(201);
  return res.body.id;
};

const idsOf = (res) => res.body.map((a) => a.id);

beforeAll(async () => {
  world = await seedWorld();
  t = world.tokens;
});

afterAll(async () => {
  await pool.end();
});

describe('booking an appointment', () => {
  test('reception can book: 201, it starts as "new", and who booked it is recorded', async () => {
    const res = await api(t.receptionA).post('/api/appointments', booking({ notes: 'first visit' }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('new');
    expect(res.body.clinic_id).toBe(world.clinicA.id);

    const [[row]] = await pool.query('SELECT status, created_by, notes FROM appointments WHERE id = ?', [res.body.id]);
    expect(row.status).toBe('new');
    expect(row.created_by).toBe(world.users.receptionA);
    expect(row.notes).toBe('first visit');
  });

  test('a deputy manager can book → 201', async () => {
    const res = await api(t.deputyA).post('/api/appointments', booking());
    expect(res.status).toBe(201);
  });

  test('a doctor cannot book → 403', async () => {
    const res = await api(t.doctorA).post('/api/appointments', booking());
    expect(res.status).toBe(403);
  });

  test('an assistant cannot book → 403', async () => {
    const res = await api(t.assistantA).post('/api/appointments', booking());
    expect(res.status).toBe(403);
  });

  test('a missing patient_id → 400', async () => {
    const res = await api(t.managerA).post('/api/appointments', booking({ patient_id: undefined }));
    expect(res.status).toBe(400);
  });

  test('a scheduled_at that is not a date → 400', async () => {
    const res = await api(t.managerA).post('/api/appointments', booking({ scheduled_at: 'tomorrow morning' }));
    expect(res.status).toBe(400);
  });

  test('a status sent by the client is ignored: it always starts as "new"', async () => {
    const res = await api(t.managerA).post('/api/appointments', booking({ status: 'completed' }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('new');
  });

  test('the doctor and the assistant are notified, reception is not', async () => {
    const id = await book(t.managerA);
    const forThisAppointment = (res) => res.body.filter((n) => n.appointment_id === id && n.type === 'new_appointment');

    expect(forThisAppointment(await api(t.doctorA).get('/api/notifications'))).toHaveLength(1);
    expect(forThisAppointment(await api(t.assistantA).get('/api/notifications'))).toHaveLength(1);
    expect(forThisAppointment(await api(t.receptionA).get('/api/notifications'))).toHaveLength(0);
  });
});

describe('changing the status', () => {
  test('manager confirms: 200, old and new status returned, and the log row is written', async () => {
    const id = await book(t.managerA);
    const res = await api(t.managerA).patch(`/api/appointments/${id}/status`, { status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.old_status).toBe('new');
    expect(res.body.new_status).toBe('confirmed');

    const [rows] = await pool.query(
      'SELECT old_status, new_status, changed_by FROM appointment_status_log WHERE appointment_id = ?',
      [id]
    );
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { old_status: 'new', new_status: 'confirmed', changed_by: world.users.managerA },
    ]);
  });

  test('a full visit is logged step by step, in order', async () => {
    const id = await book(t.managerA, { scheduled_at: '2030-04-01T10:00:00' });
    for (const status of ['confirmed', 'arrived', 'in_consultation', 'completed']) {
      const res = await api(t.managerA).patch(`/api/appointments/${id}/status`, { status });
      expect(res.status).toBe(200);
    }

    const [rows] = await pool.query(
      'SELECT old_status, new_status FROM appointment_status_log WHERE appointment_id = ? ORDER BY id',
      [id]
    );
    expect(rows.map((r) => [r.old_status, r.new_status])).toEqual([
      ['new', 'confirmed'],
      ['confirmed', 'arrived'],
      ['arrived', 'in_consultation'],
      ['in_consultation', 'completed'],
    ]);
  });

  test("the clinic's doctor can start the consultation → 200", async () => {
    const id = await book(t.managerA);
    const res = await api(t.doctorA).patch(`/api/appointments/${id}/status`, { status: 'in_consultation' });
    expect(res.status).toBe(200);
    expect(res.body.new_status).toBe('in_consultation');
  });

  test('an invalid status → 400, and the appointment is unchanged', async () => {
    const id = await book(t.managerA);
    const res = await api(t.managerA).patch(`/api/appointments/${id}/status`, { status: 'banana' });
    expect(res.status).toBe(400);

    const [[row]] = await pool.query('SELECT status FROM appointments WHERE id = ?', [id]);
    expect(row.status).toBe('new');
  });

  test('an appointment that does not exist → 404', async () => {
    const res = await api(t.managerA).patch('/api/appointments/999999/status', { status: 'confirmed' });
    expect(res.status).toBe(404);
  });

  test("the Super Admin cannot change a clinic's appointments → 403", async () => {
    const id = await book(t.managerA);
    const res = await api(t.super).patch(`/api/appointments/${id}/status`, { status: 'cancelled' });
    expect(res.status).toBe(403);

    const [[row]] = await pool.query('SELECT status FROM appointments WHERE id = ?', [id]);
    expect(row.status).toBe('new');
  });
});

describe('listing and filters', () => {
  let a1, a2, a3, a4, profile2;

  beforeAll(async () => {
    // dates in 2031 so nothing from the tests above can interfere
    a1 = await book(t.managerA, { scheduled_at: '2031-03-01T10:00:00' });
    a2 = await book(t.managerA, { scheduled_at: '2031-03-02T10:00:00' });
    a3 = await book(t.managerA, { scheduled_at: '2031-03-01T15:00:00' });
    await api(t.managerA).patch(`/api/appointments/${a2}/status`, { status: 'confirmed' });

    // a second doctor profile in clinic A, for the doctor filter
    const profile = await api(t.managerA).post('/api/doctors', { user_id: world.users.doctorA2, department_id: world.deptA });
    expect(profile.status).toBe(201);
    profile2 = profile.body.id;
    a4 = await book(t.managerA, { scheduled_at: '2031-03-05T09:00:00', doctor_id: profile2 });
  });

  test('?date= returns only that day, in time order', async () => {
    const res = await api(t.managerA).get('/api/appointments?date=2031-03-01');
    expect(res.status).toBe(200);
    expect(idsOf(res)).toEqual([a1, a3]);
  });

  test('?status= really excludes the others', async () => {
    const confirmed = await api(t.managerA).get('/api/appointments?date=2031-03-02&status=confirmed');
    expect(idsOf(confirmed)).toEqual([a2]);

    const stillNew = await api(t.managerA).get('/api/appointments?date=2031-03-02&status=new');
    expect(idsOf(stillNew)).toEqual([]);
  });

  test('?doctor_id= returns only that doctor', async () => {
    const res = await api(t.managerA).get(`/api/appointments?doctor_id=${profile2}`);
    expect(idsOf(res)).toEqual([a4]);
  });

  test('rows have readable names and the exact time that was booked (no timezone shift)', async () => {
    const res = await api(t.managerA).get('/api/appointments?date=2031-03-01');
    const first = res.body[0];
    expect(first.patient_name).toBe('Patient A');
    expect(first.doctor_name).toBe('Doctor A');
    expect(first.appointment_type).toBe('Checkup A');
    expect(first.status).toBe('new');
    expect(first.scheduled_at).toBe('2031-03-01 10:00:00');
  });

  test('one appointment by id', async () => {
    const res = await api(t.managerA).get(`/api/appointments/${a1}`);
    expect(res.status).toBe(200);
    const appointment = Array.isArray(res.body) ? res.body[0] : res.body; // works whichever shape you return
    expect(appointment.id).toBe(a1);
    expect(appointment.patient_name).toBe('Patient A');
  });

  test('an id that does not exist → 404', async () => {
    const res = await api(t.managerA).get('/api/appointments/999999');
    expect(res.status).toBe(404);
  });

  test("another clinic's manager sees none of these", async () => {
    const res = await api(t.managerB).get('/api/appointments?date=2031-03-01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('daily summary', () => {
  let s1, s2;

  beforeAll(async () => {
    s1 = await book(t.managerA, { scheduled_at: '2032-06-01T09:00:00' });
    s2 = await book(t.managerA, { scheduled_at: '2032-06-01T11:00:00' });
  });

  // These run in order: the second test builds on the first.
  test('counts the total, by status and by department', async () => {
    const res = await api(t.managerA).get('/api/appointments/summary/daily?date=2032-06-01');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.byStatus.map((r) => ({ ...r }))).toEqual([{ status: 'new', count: 2 }]);
    expect(res.body.byDepartment.map((r) => ({ ...r }))).toEqual([{ department: 'Dental A', count: 2 }]);
  });

  test('follows status changes', async () => {
    await api(t.managerA).patch(`/api/appointments/${s2}/status`, { status: 'completed' });
    const res = await api(t.managerA).get('/api/appointments/summary/daily?date=2032-06-01');
    const byStatus = Object.fromEntries(res.body.byStatus.map((r) => [r.status, r.count]));
    expect(byStatus).toEqual({ new: 1, completed: 1 });
    expect(res.body.total).toBe(2);
  });

  test('another clinic sees nothing for that day', async () => {
    const res = await api(t.managerB).get('/api/appointments/summary/daily?date=2032-06-01');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.byStatus).toEqual([]);
  });

  test('a date is required → 400', async () => {
    const res = await api(t.managerA).get('/api/appointments/summary/daily');
    expect(res.status).toBe(400);
  });
});
