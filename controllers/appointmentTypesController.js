const pool = require("../config/db");
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name } = req.body;
    let clinic_id;
    if (req.user.role !== 'manager') {
      return res.status(400).json({ message: 'Managers can only create appointment type' });
    } else {
      clinic_id = req.user.clinicId
    }
    const [result] = await pool.query('INSERT INTO appointment_types (clinic_id,name) VALUES (?,?)',
      [clinic_id, name]
    );

    res.status(201).json({ id: result.insertId, clinic_id, name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const [result] = await pool.query('SELECT * FROM appointment_types WHERE clinic_id = ?'
      , [req.user.clinicId]);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};