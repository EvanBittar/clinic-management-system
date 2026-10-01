const pool = require("../config/db");
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, department_id, assistant_user_id } = req.body;

    let clinic_id;
    if (req.user.role === 'manager') {
      clinic_id = req.user.clinicId;
    } else {
      return res.status(400).json({ message: 'Managers can only create doctors' });
    }

    const [check] = await pool.query('SELECT clinic_id, role, is_active FROM users WHERE id = ?', [user_id]);

    if (check.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (check[0].clinic_id !== clinic_id) {
      return res.status(403).json({ message: 'This user does not belong to your clinic' });
    }
    if (check[0].role !== 'doctor') {
      return res.status(400).json({ message: 'This user must have the doctor role' });
    }
    if (check[0].is_active !== 1) {
      return res.status(400).json({ message: 'This user is not active' });
    }
    const [deptCheck] = await pool.query('SELECT clinic_id FROM departments WHERE id = ?', [department_id]);
    if (deptCheck.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }
    if (deptCheck[0].clinic_id !== clinic_id) {
      return res.status(403).json({ message: 'This department does not belong to your clinic' });
    }

    const [result] = await pool.query(
      'INSERT INTO doctors (clinic_id, user_id, department_id, assistant_user_id) VALUES (?, ?, ?, ?)',
      [clinic_id, user_id, department_id, assistant_user_id || null]
    );

    res.status(201).json({ id: result.insertId, clinic_id, user_id, department_id, assistant_user_id: assistant_user_id || null });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This user is already registered as a doctor' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const [result] = await pool.query(
      'SELECT doctors.id, users.name AS doctor_name, departments.name AS department_name, doctors.assistant_user_id ' +
      'FROM doctors ' +
      'JOIN users ON users.id = doctors.user_id ' +
      'JOIN departments ON doctors.department_id = departments.id ' +
      'WHERE doctors.clinic_id = ?;',
      [req.user.clinicId]
    );
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
    const { department_id, assistant_user_id } = req.body;

    const [doctors] = await pool.query('SELECT * FROM doctors WHERE id = ?', [id]);
    if (doctors.length === 0) {
      return res.status(404).json({ message: 'Doctor record not found' });
    }
    const targetDoctor = doctors[0];

    if (String(targetDoctor.clinic_id) !== String(req.user.clinicId)) {
      return res.status(403).json({ message: 'This doctor record does not belong to your clinic' });
    }

    const isSelf = req.user.role === 'doctor' && req.user.userId === targetDoctor.user_id;
    const isAdminStaff = ['manager', 'deputy_manager'].includes(req.user.role);

    if (!isAdminStaff && !isSelf) {
      return res.status(403).json({ message: 'You are not authorized to update this doctor record' });
    }

    if (department_id !== undefined && department_id !== null) {
      const [depts] = await pool.query(
        'SELECT id FROM departments WHERE id = ? AND clinic_id = ?',
        [department_id, req.user.clinicId]
      );
      if (depts.length === 0) {
        return res.status(400).json({ message: 'Invalid department_id or department does not belong to your clinic' });
      }
    }
    if (assistant_user_id !== undefined && assistant_user_id !== null) {
      const [assistants] = await pool.query(
        'SELECT id FROM users WHERE id = ? AND clinic_id = ? AND role = "assistant"',
        [assistant_user_id, req.user.clinicId]
      );
      if (assistants.length === 0) {
        return res.status(400).json({ message: 'Invalid assistant_user_id or user is not an assistant in your clinic' });
      }
    }

    const fields = [];
    const values = [];

    if (department_id !== undefined) {
      fields.push('department_id = ?');
      values.push(department_id);
    }
    if (assistant_user_id !== undefined) {
      fields.push('assistant_user_id = ?');
      values.push(assistant_user_id);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    values.push(id);
    await pool.query(`UPDATE doctors SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query(
      `SELECT d.id, d.clinic_id, d.user_id, u.name AS doctor_name, 
              d.department_id, dep.name AS department_name, d.assistant_user_id 
       FROM doctors d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN departments dep ON d.department_id = dep.id
       WHERE d.id = ?`,
      [id]
    );

    res.json(updated[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};