require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./config/db');

async function seed() {
  const hashedPassword = await bcrypt.hash('evanevo3234', 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, role, username, password, clinic_id) VALUES (?, ?, ?, ?, NULL)',
    ['Super Admin', 'super_admin', 'superadmin', hashedPassword]
  );
  console.log('Super Admin created with id:', result.insertId);
  process.exit(0);
}

seed();