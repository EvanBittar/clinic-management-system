const http = require('http');
const app = require('./app');
const { startReminderScheduler } = require('./jobs/reminderScheduler');
const { initRealtime } = require('./services/realtime');

const PORT = process.env.PORT;

// Express and Socket.io share one server and one port
const server = http.createServer(app);
initRealtime(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  startReminderScheduler();
});
