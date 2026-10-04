const pool = require("../config/db");
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, clinic_id: bodyClinicId } = req.body;
    const { role, clinicId: tokenClinicId } = req.user;

    let clinic_id;
    if (role === 'super_admin') {
      clinic_id = Number(bodyClinicId);
    } else if (['manager', 'deputy_manager'].includes(role)) {
      clinic_id = Number(tokenClinicId);
    } else {
      return res.status(403).json({ message: 'You are not allowed to create appointment types' });
    }

    if (!clinic_id) {
      return res.status(400).json({ message: 'Valid clinic_id is required' });
    }

    const [result] = await pool.query(
      'INSERT INTO appointment_types (clinic_id, name) VALUES (?, ?)',
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
    const { role, clinicId } = req.user;
    const { clinic_id: queryClinicId } = req.query;

    let sql = 'SELECT * FROM appointment_types';
    const params = [];

    if (role !== 'super_admin') {
      sql += ' WHERE clinic_id = ?';
      params.push(clinicId);
    } else if (queryClinicId) {
      sql += ' WHERE clinic_id = ?';
      params.push(queryClinicId);
    }

    const [result] = await pool.query(sql, params);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
