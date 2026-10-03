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
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

exports.toggleActive = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { is_active } = req.body;

    const [result] = await pool.query(
      'UPDATE clinics SET is_active = ? WHERE id = ?',
      [is_active, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    res.json({
      message: `Clinic status updated to ${is_active ? 'active' : 'inactive'}`,
      id: Number(id),
      is_active
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const [result] = await pool.query(`
      SELECT c.id, c.name, c.is_active, c.created_at, ct.name AS clinic_type
      FROM clinics c
      LEFT JOIN clinic_types ct ON c.clinic_type_id = ct.id
      ORDER BY c.created_at DESC
    `);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'super_admin' && req.user.clinicId !== Number(id)) {
      return res.status(403).json({ message: 'Access denied: Cannot view another clinic' });
    }

    const [result] = await pool.query(`
      SELECT c.id, c.name, c.is_active, c.created_at, ct.name AS clinic_type
      FROM clinics c
      LEFT JOIN clinic_types ct ON c.clinic_type_id = ct.id
      WHERE c.id = ?
    `, [id]);

    if (result.length === 0) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.update = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const { name, clinic_type_id } = req.body;
    const { role, clinic_id } = req.user;

    if (role !== 'super_admin' && clinic_id !== Number(id)) {
      return res.status(403).json({ message: 'Access denied: Cannot update another clinic' });
    }
    let query = '';
    let params = [];

    if (role === 'super_admin') {
      query = 'UPDATE clinics SET name = ?, clinic_type_id = ? WHERE id = ?';
      params = [name, clinic_type_id || null, id];
    } else {
      query = 'UPDATE clinics SET name = ? WHERE id = ?';
      params = [name, id];
    }

    const [result] = await pool.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    res.json({
      message: 'Clinic updated successfully',
      id: Number(id),
      updated_fields: role === 'super_admin' ? { name, clinic_type_id } : { name }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });

  }
};