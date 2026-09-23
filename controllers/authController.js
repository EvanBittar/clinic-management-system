const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    // License check — skip for super_admin, since they have no clinic
    if (user.role !== 'super_admin') {
      const [clinicRows] = await pool.query('SELECT is_active FROM clinics WHERE id = ?', [user.clinic_id]);
      if (clinicRows.length === 0 || !clinicRows[0].is_active) {
        return res.status(403).json({ message: 'This clinic\'s access is currently inactive. Please contact support.' });
      }
    }

    // Log this login
    await pool.query(
      'INSERT INTO login_logs (user_id, clinic_id) VALUES (?, ?)',
      [user.id, user.clinic_id]
    );

    const token = jwt.sign(
      { userId: user.id, role: user.role, clinicId: user.clinic_id },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ message: 'Login successful', token, role: user.role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to log in' });
  }
};