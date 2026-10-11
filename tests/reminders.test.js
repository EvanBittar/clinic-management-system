const { pool } = require('./helpers/db');
const { seedWorld, api } = require('./helpers/seed');
const { runReminderCheck } = require('../jobs/reminderScheduler'); // requiring it does NOT start the cron timer

let world;

beforeAll(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end();
});

// Book through the real API (so real rules apply)...
async function bookAppointment() {
  const res = await api(world.tokens.managerA).post('/api/appointments', {
    patient_id: world.patientA,
    doctor_id: world.doctorProfileA,
    appointment_type_id: world.typeA,
    scheduled_at: '2030-01-01T10:00:00',
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

// ...then move the appointment to "N seconds from now" with SQL, instead of waiting for real time.
const moveTo = (id, seconds) =>
  pool.query('UPDATE appointments SET scheduled_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?', [seconds, id]);

const remindersFor = async (id, type) => {
  const [rows] = await pool.query('SELECT user_id FROM notifications WHERE appointment_id = ? AND type = ?', [id, type]);
  return rows.map((r) => r.user_id).sort((a, b) => a - b);
};

const doctorAndAssistant = () => [world.users.doctorA, world.users.assistantA].sort((a, b) => a - b);

describe('reminder scheduler', () => {
  test('1-hour reminder goes to the doctor AND the assistant, exactly once', async () => {
    const id = await bookAppointment();
    await moveTo(id, 60 * 60 + 30); // 60.5 minutes away: inside the 60-61 minute window

    await runReminderCheck();
    expect(await remindersFor(id, 'reminder_1hr')).toEqual(doctorAndAssistant());

    await runReminderCheck(); // running again must NOT create duplicates
    expect(await remindersFor(id, 'reminder_1hr')).toEqual(doctorAndAssistant());
  });

  test('30-minute reminder is sent, and no 1-hour reminder is created for it', async () => {
    const id = await bookAppointment();
    await moveTo(id, 30 * 60 + 30); // 30.5 minutes away

    await runReminderCheck();
    expect(await remindersFor(id, 'reminder_30min')).toEqual(doctorAndAssistant());
    expect(await remindersFor(id, 'reminder_1hr')).toEqual([]);
  });

  test('a cancelled appointment gets no reminder', async () => {
    const id = await bookAppointment();
    await moveTo(id, 60 * 60 + 30);
    await pool.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [id]);

    await runReminderCheck();
    expect(await remindersFor(id, 'reminder_1hr')).toEqual([]);
  });

  test('an appointment far in the future gets no reminder yet', async () => {
    const id = await bookAppointment(); // still scheduled for 2030

    await runReminderCheck();
    expect(await remindersFor(id, 'reminder_1hr')).toEqual([]);
    expect(await remindersFor(id, 'reminder_30min')).toEqual([]);
  });

  test('an appointment moved after its reminder was sent gets a fresh reminder', async () => {
    const id = await bookAppointment();
    await moveTo(id, 60 * 60 + 30);
    await runReminderCheck();
    expect(await remindersFor(id, 'reminder_1hr')).toEqual(doctorAndAssistant());

    await moveTo(id, 56 * 60 + 40); // rescheduled to a different time, still inside the reminder window
    await runReminderCheck();
    const twice = [...doctorAndAssistant(), ...doctorAndAssistant()].sort((a, b) => a - b);
    expect(await remindersFor(id, 'reminder_1hr')).toEqual(twice);
  });

  test('catch-up: a reminder that became due a few minutes ago is still sent', async () => {
    const id = await bookAppointment();
    await moveTo(id, 57 * 60); // the 1-hour mark passed 3 minutes ago, as if the server had been off
    await runReminderCheck();
    expect(await remindersFor(id, 'reminder_1hr')).toEqual(doctorAndAssistant());
  });

  test('booked less than an hour ahead: no "1 hour" reminder', async () => {
    const id = await bookAppointment();
    await moveTo(id, 50 * 60);
    await runReminderCheck();
    expect(await remindersFor(id, 'reminder_1hr')).toEqual([]);
  });
});
