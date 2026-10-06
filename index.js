const app = require('./app')
const startReminderScheduler = require('./services/reminderScheduler');
const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  startReminderScheduler();
});