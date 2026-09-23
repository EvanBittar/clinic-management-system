const pool = require('../config/db');
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    const { name } = req.body;
    let clinic_id;

    if (req.user.role === 'manager') {
      clinic_id = req.user.clinicId;
    } else {
      return res.status(400).json({ message: 'Managers can only create departments' });
    }
    const [result] = await pool.query('INSERT INTO departments (clinic_id,name) VALUES (?,?)',
      [clinic_id, name]
    );

    res.status(201).json({ id: result.insertId, clinic_id, name});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

exports.getAll = async (req,res) => {
try {
  const [rows] = await pool.query('SELECT * FROM departments');
    res.json(rows);
} catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
}
}