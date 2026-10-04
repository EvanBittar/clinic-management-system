const pool = require('../config/db');
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name } = req.body;

    const [result] = await pool.query(
      'INSERT INTO clinic_types (name) VALUES (?)',
      [name]
    );

    res.status(201).json({ id: result.insertId, name });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Clinic type already exists' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name FROM clinic_types ORDER BY name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
