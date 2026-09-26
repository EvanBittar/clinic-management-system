const pool = require("../config/db");
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, role, username, password } = req.body;
    let clinic_id;

    if (req.user.role === 'super_admin') {
      // Super Admin can only create Managers, for any clinic
      clinic_id = req.body.clinic_id;
      if (role !== 'manager') {
        return res.status(400).json({ message: 'Super Admin can only create Manager accounts' });
      }
    } else if (req.user.role === 'manager') {
      // Manager can create anyone below them, within their own clinic
      clinic_id = req.user.clinicId;
      if (!['deputy_manager', 'doctor', 'assistant', 'reception'].includes(role)) {
        return res.status(400).json({ message: 'Managers can only create Deputy Manager, Doctor, Assistant, or Reception accounts' });
      }
    } else if (req.user.role === 'deputy_manager') {
      // Deputy can create staff, but NOT another deputy
      clinic_id = req.user.clinicId;
      if (!['doctor', 'assistant', 'reception'].includes(role)) {
        return res.status(400).json({ message: 'Deputy Managers can only create Doctor, Assistant, or Reception accounts' });
      }
    } else {
      return res.status(403).json({ message: 'You are not allowed to create users' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (clinic_id, name, role, username, password) VALUES (?, ?, ?, ?, ?)',
      [clinic_id, name, role, username, hashedPassword]
    );

    res.status(201).json({ id: result.insertId, clinic_id, name, role, username });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That username is already taken' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};