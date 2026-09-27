const pool = require("../config/db");
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const allowedRoles = ['manager', 'deputy_manager', 'reception'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You are not allowed to create patients' });
    }

    const clinic_id = req.user.clinicId;
    const { name, phone, date_of_birth, notes } = req.body;

    const [result] = await pool.query(
      'INSERT INTO patients (clinic_id, name, phone, date_of_birth, notes) VALUES (?, ?, ?, ?, ?)',
      [clinic_id, name, phone || null, date_of_birth || null, notes || null]
    );

    res.status(201).json({ id: result.insertId, clinic_id, name, phone, date_of_birth, notes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const clinic_id = req.user.clinicId;
    const { search } = req.query;

    let query = 'SELECT * FROM patients WHERE clinic_id = ?';
    const params = [clinic_id];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const [result] = await pool.query(query, params);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};