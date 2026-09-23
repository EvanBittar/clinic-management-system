const pool = require('../config/db');
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name, clinic_type_id } = req.body;
    const [result] = await pool.query('INSERT INTO clinics (name,clinic_type_id) VALUES (?,?)'
      , [name, clinic_type_id]);
    res.status(201).json({ id: result.insertId, name, clinic_type_id })

  } catch (error) {
    console.error(error);
    res.status(500).json({message: 'Internal Server Error'});
  }
}

