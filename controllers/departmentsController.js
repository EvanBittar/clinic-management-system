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

    res.status(201).json({ id: result.insertId, clinic_id, name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

exports.getAll = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.update = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    const { id } = req.params;
    const { name } = req.body;

    const [departments] = await pool.query('SELECT * FROM departments WHERE id = ?', [id]);
    if (departments.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }
    const targetDepartment = departments[0];

    if (!['manager', 'deputy_manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'You are not allowed to update departments' });
    }
    if (String(targetDepartment.clinic_id) !== String(req.user.clinicId)) {
      return res.status(403).json({ message: 'This department does not belong to your clinic' });
    }

    const fields = [];
    const values = [];

    if (name) {
      fields.push('name = ?');
      values.push(name);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    values.push(id);
    await pool.query(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query('SELECT id, clinic_id, name FROM departments WHERE id = ?', [id]);
    res.json(updated[0]);

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Department name already exists in this clinic' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, clinicId } = req.user;

    // 1. Check department existence and tenant access
    const [dept] = await pool.query('SELECT clinic_id FROM departments WHERE id = ?', [id]);
    if (dept.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }

    if (role !== 'super_admin' && dept[0].clinic_id !== clinicId) {
      return res.status(403).json({ message: 'Access denied: Department belongs to another clinic' });
    }

    // 2. Check if any ACTIVE doctors are assigned
    const [activeDoctors] = await pool.query(
      'SELECT d.id FROM doctors d JOIN users u ON d.user_id = u.id WHERE d.department_id = ? AND u.is_active = 1 LIMIT 1',
      [id]
    );

    if (activeDoctors.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete department: Active doctors are currently assigned to it. Reassign or remove them first.'
      });
    }

    // 3. Unassign inactive doctors (set department_id = NULL) so the FK constraint doesn't fail
    await pool.query('UPDATE doctors SET department_id = NULL WHERE department_id = ?', [id]);

    // 4. Delete department
    await pool.query('DELETE FROM departments WHERE id = ?', [id]);

    res.json({ message: 'Department deleted successfully', id: Number(id) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};