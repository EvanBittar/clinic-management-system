const pool = require("../config/db");
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, department_id, assistant_user_id, clinic_id: bodyClinicId } = req.body;
    const { role, clinicId: tokenClinicId } = req.user;

    let clinic_id;
    if (role === 'super_admin') {
      clinic_id = Number(bodyClinicId || tokenClinicId);
    } else if (['manager', 'deputy_manager'].includes(role)) {
      clinic_id = Number(tokenClinicId);
    } else {
      return res.status(403).json({ message: 'Access denied: Unauthorized role' });
    }

    if (!clinic_id) {
      return res.status(400).json({ message: 'Valid clinic_id is required' });
    }

    const [userRows] = await pool.query(
      'SELECT clinic_id, role, is_active FROM users WHERE id = ?',
      [user_id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'Doctor user not found' });
    }

    const doctorUser = userRows[0];
    if (Number(doctorUser.clinic_id) !== clinic_id) {
      return res.status(403).json({ message: 'This user does not belong to your clinic' });
    }
    if (doctorUser.role !== 'doctor') {
      return res.status(400).json({ message: 'This user must have the doctor role' });
    }
    if (doctorUser.is_active !== 1) {
      return res.status(400).json({ message: 'This user account is inactive' });
    }

    const [deptRows] = await pool.query(
      'SELECT clinic_id FROM departments WHERE id = ?',
      [department_id]
    );

    if (deptRows.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }
    if (Number(deptRows[0].clinic_id) !== clinic_id) {
      return res.status(403).json({ message: 'This department does not belong to your clinic' });
    }

    if (assistant_user_id) {
      const [assistantRows] = await pool.query(
        'SELECT clinic_id, is_active FROM users WHERE id = ?',
        [assistant_user_id]
      );

      if (assistantRows.length === 0) {
        return res.status(404).json({ message: 'Assistant user not found' });
      }
      if (Number(assistantRows[0].clinic_id) !== clinic_id) {
        return res.status(403).json({ message: 'Assistant user does not belong to your clinic' });
      }
      if (assistantRows[0].is_active !== 1) {
        return res.status(400).json({ message: 'Assistant user account is inactive' });
      }
    }

    const [result] = await pool.query(
      'INSERT INTO doctors (clinic_id, user_id, department_id, assistant_user_id) VALUES (?, ?, ?, ?)',
      [clinic_id, user_id, department_id, assistant_user_id || null]
    );

    res.status(201).json({
      message: 'Doctor created successfully',
      id: result.insertId,
      clinic_id,
      user_id,
      department_id,
      assistant_user_id: assistant_user_id || null
    });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This user is already registered as a doctor' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ message: 'Referenced user or department does not exist' });
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

    if (role !== 'super_admin' && Number(doctor.clinic_id) !== Number(clinicId)) {
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

    if (req.query.date && !/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
    }

    let doctorId = req.query.doctor_id;

    if (!doctorId && role === 'doctor') {
      const [doc] = await pool.query('SELECT id FROM doctors WHERE user_id = ?', [userId]);
      if (doc.length === 0) {
        return res.status(404).json({ message: 'No doctor profile linked to this user' });
      }
      doctorId = doc[0].id;
    }

    if (!doctorId && role === 'assistant') {
      const [doc] = await pool.query('SELECT id FROM doctors WHERE assistant_user_id = ?', [userId]);
      if (doc.length === 0) {
        return res.status(404).json({ message: 'No doctor assigned to this assistant' });
      }
      doctorId = doc[0].id;
    }

    if (!doctorId) {
      return res.status(400).json({ message: 'Doctor ID parameter is required' });
    }

    let doctorCheckQuery = 'SELECT id, clinic_id FROM doctors WHERE id = ?';
    const doctorCheckParams = [doctorId];

    if (role !== 'super_admin') {
      doctorCheckQuery += ' AND clinic_id = ?';
      doctorCheckParams.push(clinicId);
    }

    const [doctorRows] = await pool.query(doctorCheckQuery, doctorCheckParams);

    if (doctorRows.length === 0) {
      return res.status(404).json({ message: 'Doctor not found or access denied' });
    }

    const targetClinicId = doctorRows[0].clinic_id;

    const [appointments] = await pool.query(
      `
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
      `,
      [doctorId, targetClinicId, targetDate]
    );

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