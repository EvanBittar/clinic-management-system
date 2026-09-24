const pool = require("../config/db");
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, department_id, assistant_user_id } = req.body;

    let clinic_id;
    if (req.user.role === 'manager') {
      clinic_id = req.user.clinicId;
    } else {
      return res.status(400).json({ message: 'Managers can only create doctors' });
    }

    const [check] = await pool.query('SELECT clinic_id, role, is_active FROM users WHERE id = ?', [user_id]);

    if (check.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (check[0].clinic_id !== clinic_id) {
      return res.status(403).json({ message: 'This user does not belong to your clinic' });
    }
    if (check[0].role !== 'doctor') {
      return res.status(400).json({ message: 'This user must have the doctor role' });
    }
    if (check[0].is_active !== 1) {
      return res.status(400).json({ message: 'This user is not active' });
    }
    const [deptCheck] = await pool.query('SELECT clinic_id FROM departments WHERE id = ?', [department_id]);
    if (deptCheck.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }
    if (deptCheck[0].clinic_id !== clinic_id) {
      return res.status(403).json({ message: 'This department does not belong to your clinic' });
    }

    const [result] = await pool.query(
      'INSERT INTO doctors (clinic_id, user_id, department_id, assistant_user_id) VALUES (?, ?, ?, ?)',
      [clinic_id, user_id, department_id, assistant_user_id || null]
    );

    res.status(201).json({ id: result.insertId, clinic_id, user_id, department_id, assistant_user_id: assistant_user_id || null });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This user is already registered as a doctor' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};