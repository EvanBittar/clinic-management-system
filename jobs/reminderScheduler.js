const cron = require('node-cron');
const pool = require('../config/db');
const { createNotification } = require('../controllers/notificationsController');

async function sendReminderBatch(minutesBefore, type, label) {
    const [appointments] = await pool.query(
        `SELECT a.id, a.clinic_id, a.scheduled_at, d.user_id AS doctor_user_id, d.assistant_user_id
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.status NOT IN ('cancelled', 'completed', 'no_show')
       AND a.scheduled_at > NOW()
       AND a.scheduled_at <= DATE_ADD(NOW(), INTERVAL ? MINUTE)
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.appointment_id = a.id AND n.type = ?
       )`,
        [minutesBefore, minutesBefore + 1, type]
    );

    for (const appt of appointments) {
        const message = `${label} — appointment at ${appt.scheduled_at}`;
        await createNotification(appt.clinic_id, appt.doctor_user_id, appt.id, type, message);
        if (appt.assistant_user_id) {
            await createNotification(appt.clinic_id, appt.assistant_user_id, appt.id, type, message);
        }
    }

    if (appointments.length > 0) {
        console.log(`Sent ${appointments.length} "${type}" reminder(s)`);
    }
}

async function runReminderCheck() {
    try {
        await sendReminderBatch(60, 'reminder_1hr', 'Appointment reminder: 1 hour remaining');
        await sendReminderBatch(30, 'reminder_30min', 'Appointment reminder: 30 minutes remaining');
    } catch (error) {
        console.error('Reminder job failed:', error);
    }
}

function startReminderScheduler() {
    cron.schedule('* * * * *', runReminderCheck);
    console.log('Reminder scheduler started (checking every minute)');
}

module.exports = {
    startReminderScheduler,
    runReminderCheck
};