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
    const { role, clinicId } = req.user;

    if (role !== 'super_admin' && Number(clinicId) !== Number(id)) {
      return res.status(403).json({ message: 'Access denied: Cannot view another clinic' });
    }

    const [rows] = await pool.query(
      `
      SELECT c.id, c.name, c.is_active, c.created_at, ct.name AS clinic_type
      FROM clinics c
      LEFT JOIN clinic_types ct ON c.clinic_type_id = ct.id
      WHERE c.id = ?
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    res.json(rows[0]);
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
    const { role, clinicId } = req.user;

    if (role !== 'super_admin' && Number(clinicId) !== Number(id)) {
      return res.status(403).json({ message: 'Access denied: Cannot update another clinic' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (role === 'super_admin' && clinic_type_id !== undefined) {
      updates.push('clinic_type_id = ?');
      params.push(clinic_type_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    params.push(id);
    const query = `UPDATE clinics SET ${updates.join(', ')} WHERE id = ?`;

    const [result] = await pool.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Clinic not found' });
    }

    const [updatedClinic] = await pool.query('SELECT id, name, clinic_type_id FROM clinics WHERE id = ?', [id]);

    res.json({
      message: 'Clinic updated successfully',
      clinic: updatedClinic[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};