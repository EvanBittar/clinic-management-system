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
    const { role, clinicId } = req.user;

    let query = `
      SELECT 
        d.id, 
        d.clinic_id,
        u.name AS doctor_name, 
        u.is_active,
        dep.name AS department_name, 
        d.assistant_user_id,
        ast.name AS assistant_name
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN users ast ON d.assistant_user_id = ast.id
    `;
    
    const params = [];

    // Tenant isolation check
    if (role !== 'super_admin') {
      query += ' WHERE d.clinic_id = ?';
      params.push(clinicId);
    }

    query += ' ORDER BY u.name ASC';

    const [doctors] = await pool.query(query, params);
    
    res.json(doctors);
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

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, clinicId } = req.user;

    const [doctors] = await pool.query(`
      SELECT 
        d.id,
        d.user_id, 
        d.clinic_id, 
        d.department_id, 
        d.assistant_user_id,
        u.name AS doctor_name, 
        u.username, 
        dep.name AS department_name,
        ast.name AS assistant_name
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN users ast ON d.assistant_user_id = ast.id
      WHERE d.id = ?
    `, [id]);

    if (doctors.length === 0) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    const doctor = doctors[0];

    if (role !== 'super_admin' && doctor.clinic_id !== clinicId) {
      return res.status(403).json({ message: 'Access denied: Doctor belongs to another clinic' });
    }

    res.json(doctor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getSchedule = async (req, res) => {
  try {
    const { userId, role, clinicId } = req.user;
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];

    let doctorId = req.query.doctor_id;

    // Automatically resolve doctor_id from user session if logged in as a doctor
    if (!doctorId && role === 'doctor') {
      const [doc] = await pool.query('SELECT id FROM doctors WHERE user_id = ?', [userId]);
      if (doc.length === 0) {
        return res.status(404).json({ message: 'No doctor profile linked to this user' });
      }
      doctorId = doc[0].id;
    }

    if (!doctorId) {
      return res.status(400).json({ message: 'Doctor ID parameter is required' });
    }

    // 1. Verify doctor existence and multi-tenant access check
    let doctorCheckQuery = 'SELECT id, clinic_id FROM doctors WHERE id = ?';
    const doctorCheckParams = [doctorId];

    if (role !== 'super_admin') {
      doctorCheckQuery += ' AND clinic_id = ?';
      doctorCheckParams.push(clinicId);
    }

    const [doctorExists] = await pool.query(doctorCheckQuery, doctorCheckParams);

    if (doctorExists.length === 0) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // 2. Query appointments for valid doctor
    const [appointments] = await pool.query(`
      SELECT 
        a.id AS appointment_id,
        a.scheduled_at,
        a.status,
        a.notes,
        p.id AS patient_id,
        p.name AS patient_name,
        p.phone AS patient_phone,
        at.name AS appointment_type
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
      WHERE a.doctor_id = ? 
        AND a.clinic_id = ? 
        AND DATE(a.scheduled_at) = ?
      ORDER BY a.scheduled_at ASC
    `, [doctorId, clinicId, targetDate]);

    res.json({
      date: targetDate,
      doctor_id: Number(doctorId),
      total_appointments: appointments.length,
      schedule: appointments
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};