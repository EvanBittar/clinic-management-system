const cron = require('node-cron');
const pool = require('../config/db');

const processRemindersAndEscalations = async () => {
  try {
    // -----------------------------------------------------------------
    // STEP 1: 1-Hour Reminder for Doctor
    // -----------------------------------------------------------------
    const [oneHourAppts] = await pool.query(`
      SELECT 
        a.id AS appointment_id,
        a.clinic_id,
        a.scheduled_at,
        p.name AS patient_name,
        d.user_id AS doctor_user_id
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.scheduled_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 HOUR)
        AND a.status IN ('new', 'confirmed')
        AND NOT EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.appointment_id = a.id AND n.type = 'reminder_1hr'
        )
    `);

    for (const appt of oneHourAppts) {
      const timeStr = new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msg = `Reminder (1h): Appointment with ${appt.patient_name} at ${timeStr}. Please confirm.`;

      await pool.query(
        `INSERT INTO notifications (clinic_id, user_id, appointment_id, type, message, is_read)
         VALUES (?, ?, ?, 'reminder_1hr', ?, 0)`,
        [appt.clinic_id, appt.doctor_user_id, appt.appointment_id, msg]
      );
    }

    // -----------------------------------------------------------------
    // STEP 2: 30-Min Unacknowledged Escalation to Assistant
    // -----------------------------------------------------------------
    const [escalationAppts] = await pool.query(`
      SELECT 
        a.id AS appointment_id,
        a.clinic_id,
        a.scheduled_at,
        p.name AS patient_name,
        d.user_id AS doctor_user_id
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.scheduled_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 MINUTE)
        AND a.status IN ('new', 'confirmed')
        -- 1-Hour reminder was sent but doctor NEVER acknowledged/read it (is_read = 0)
        AND EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.appointment_id = a.id AND n.type = 'reminder_1hr' AND n.is_read = 0
        )
        -- Assistant escalation hasn't been fired yet
        AND NOT EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.appointment_id = a.id AND n.type = 'escalation_assistant'
        )
    `);

    for (const appt of escalationAppts) {
      const timeStr = new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Find assistants belonging to the same clinic tenant
      const [assistants] = await pool.query(
        `SELECT id FROM users WHERE clinic_id = ? AND role IN ('assistant', 'receptionist')`,
        [appt.clinic_id]
      );

      // 1. Send urgent follow-up to doctor
      await pool.query(
        `INSERT INTO notifications (clinic_id, user_id, appointment_id, type, message, is_read)
         VALUES (?, ?, ?, 'reminder_30min', ?, 0)`,
        [
          appt.clinic_id, 
          appt.doctor_user_id, 
          appt.appointment_id, 
          `URGENT (30m): Unconfirmed appointment with ${appt.patient_name} at ${timeStr}.`
        ]
      );

      // 2. Escalate to clinic assistant(s)
      for (const assistant of assistants) {
        await pool.query(
          `INSERT INTO notifications (clinic_id, user_id, appointment_id, type, message, is_read)
           VALUES (?, ?, ?, 'escalation_assistant', ?, 0)`,
          [
            appt.clinic_id, 
            assistant.id, 
            appt.appointment_id, 
            `ESCALATION: Doctor has not confirmed appointment #${appt.appointment_id} (${appt.patient_name}) at ${timeStr}.`
          ]
        );
      }
    }
  } catch (error) {
    console.error('[CRON ERROR]', error);
  }
};

const startReminderScheduler = () => {
  cron.schedule('*/5 * * * *', processRemindersAndEscalations);
};

module.exports = startReminderScheduler;