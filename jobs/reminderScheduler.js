const cron = require('node-cron');
const pool = require('../config/db');
const { createNotification } = require('../controllers/notificationsController');

// Each reminder: its notification type, how many minutes before the appointment it is due,
// and how many minutes of "catch-up" we allow if the server was off or busy at the exact moment.
const REMINDERS = [
  { type: 'reminder_1hr', minutesBefore: 60, catchUp: 5 },
  { type: 'reminder_30min', minutesBefore: 30, catchUp: 5 },
];

async function sendReminderBatch({ type, minutesBefore, catchUp }) {
  // Appointments that are now (about) `minutesBefore` minutes away.
  // The window is wider than one minute so a restart or a slow tick can't skip a reminder.
  // Allowlist of statuses: only appointments that are still upcoming get reminders.
  const [appointments] = await pool.query(
    `SELECT a.id, a.clinic_id, a.scheduled_at,
            TIMESTAMPDIFF(MINUTE, NOW(), a.scheduled_at) AS minutes_left,
            p.name AS patient_name,
            d.user_id AS doctor_user_id, d.assistant_user_id
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     JOIN patients p ON a.patient_id = p.id
     WHERE a.status IN ('new', 'confirmed')
       AND a.scheduled_at BETWEEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
                              AND DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
    [minutesBefore - catchUp, minutesBefore + 1]
  );

  let sent = 0;
  for (const appt of appointments) {
    // Claim this reminder. The UNIQUE key (appointment_id, type, scheduled_for) lets only ONE
    // attempt ever succeed, even if two runs overlap. If the appointment is rescheduled,
    // scheduled_for changes, so it correctly gets a fresh reminder.
    const [claim] = await pool.query(
      'INSERT IGNORE INTO appointment_reminders (appointment_id, type, scheduled_for) VALUES (?, ?, ?)',
      [appt.id, type, appt.scheduled_at]
    );
    if (claim.affectedRows === 0) continue; // this reminder was already sent

    try {
      const time = String(appt.scheduled_at).slice(11, 16); // 'HH:MM' (dates come back as strings)
      const message = `Reminder: ${appt.patient_name} at ${time} (in about ${appt.minutes_left} minutes)`;
      await createNotification(appt.clinic_id, appt.doctor_user_id, appt.id, type, message);
      if (appt.assistant_user_id) {
        await createNotification(appt.clinic_id, appt.assistant_user_id, appt.id, type, message);
      }
      sent++;
    } catch (error) {
      // Could not notify: release the claim so the next minute tries again
      await pool.query('DELETE FROM appointment_reminders WHERE id = ?', [claim.insertId]);
      console.error(`Reminder ${type} for appointment ${appt.id} failed, will retry:`, error.message);
    }
  }

  if (sent > 0) {
    console.log(`Sent ${sent} "${type}" reminder(s)`);
  }
}

let running = false;

async function runReminderCheck() {
  if (running) return; // previous run still going: skip this tick instead of overlapping
  running = true;
  try {
    for (const reminder of REMINDERS) {
      await sendReminderBatch(reminder);
    }
  } catch (error) {
    console.error('Reminder job failed:', error);
  } finally {
    running = false;
  }
}

function startReminderScheduler() {
  cron.schedule('* * * * *', runReminderCheck);
  runReminderCheck(); // also check right now, so a restart catches up immediately
  console.log('Reminder scheduler started (checking every minute)');
}

module.exports = { startReminderScheduler, runReminderCheck };
