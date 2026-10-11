// Copies the STRUCTURE (no data) of your real database into clinic_system_test.
// Foreign keys, unique constraints and indexes are copied too.
//
// Usage (from the project root):  node scripts/cloneSchema.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const TARGET = 'clinic_system_test';

async function main() {
  const source = process.env.DB_NAME;
  if (!source || source.endsWith('_test')) {
    throw new Error(`DB_NAME in your .env must be your real database, but it is "${source}"`);
  }

  // One connection, not a pool: USE and SET FOREIGN_KEY_CHECKS only last for one connection.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // 1. Read the CREATE TABLE statement of every table in the real database
    const [rows] = await conn.query(`SHOW TABLES FROM \`${source}\``);
    const tables = rows.map((r) => Object.values(r)[0]);

    const ddl = [];
    for (const table of tables) {
      const [[row]] = await conn.query(`SHOW CREATE TABLE \`${source}\`.\`${table}\``);
      ddl.push({ table, sql: row['Create Table'] });
    }

    // 2. Re-create them inside the test database (the target name is hard-coded on purpose)
    await conn.query(`USE \`${TARGET}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { table, sql } of ddl) {
      await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
      await conn.query(sql);
      console.log('created', table);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log(`\nDone: ${ddl.length} tables copied from ${source} to ${TARGET}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
