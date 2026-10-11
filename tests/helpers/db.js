const pool = require('../../config/db');

// Safety net: refuse to touch anything that is not a *_test database.
// resetDatabase() TRUNCATES tables, so this check is what protects your real data.
function assertTestDatabase() {
  const name = process.env.DB_NAME || '';
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run: DB_NAME is "${name}" but tests may only use a database ending in _test`);
  }
}

const TABLES = [
  'appointment_status_log',
  'notifications',
  'login_logs',
  'appointments',
  'doctors',
  'patients',
  'appointment_types',
  'departments',
  'users',
  'clinics',
  'clinic_types',
];

async function resetDatabase() {
  assertTestDatabase();

  // SET FOREIGN_KEY_CHECKS only lasts for ONE connection.
  // pool.query() may use a different connection every call, so we borrow one
  // connection and use it for the whole reset.
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

module.exports = { pool, assertTestDatabase, resetDatabase };
