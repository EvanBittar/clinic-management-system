const pool = require("../config/db");
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const allowedRoles = ['manager', 'deputy_manager', 'reception'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You are not allowed to create patients' });
    }

    const clinic_id = req.user.clinicId;
    const { name, phone, date_of_birth, notes } = req.body;

    const [result] = await pool.query(
      'INSERT INTO patients (clinic_id, name, phone, date_of_birth, notes) VALUES (?, ?, ?, ?, ?)',
      [clinic_id, name, phone || null, date_of_birth || null, notes || null]
    );

    res.status(201).json({ id: result.insertId, clinic_id, name, phone, date_of_birth, notes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const clinic_id = req.user.clinicId;
    const { search } = req.query;

    let query = 'SELECT * FROM patients WHERE clinic_id = ?';
    const params = [clinic_id];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const [result] = await pool.query(query, params);
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
    const { name, phone, date_of_birth, notes } = req.body;

    const [patients] = await pool.query('SELECT * FROM patients WHERE id = ?', [id]);
    if (patients.length === 0) {
      return res.status(404).json({ message: 'Patient record not found' });
    }
    const targetPatient = patients[0];

    if (String(targetPatient.clinic_id) !== String(req.user.clinicId)) {
      return res.status(403).json({ message: 'This patient record does not belong to your clinic' });
    }

    const allowedRoles = ['manager', 'deputy_manager', 'reception'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You are not allowed to update patients' });
    }

    // 3. Dynamic SET Clause Builder
    const fields = [];
    const values = [];

    if (name) {
      fields.push('name = ?');
      values.push(name);
    }
    if (phone !== undefined) {
      fields.push('phone = ?');
      values.push(phone);
    }
    if (date_of_birth !== undefined) {
      fields.push('date_of_birth = ?');
      values.push(date_of_birth);
    }
    if (notes !== undefined) {
      fields.push('notes = ?');
      values.push(notes);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    values.push(id);
    await pool.query(`UPDATE patients SET ${fields.join(', ')} WHERE id = ?`, values);

    // 4. Return Updated Record
    const [updated] = await pool.query('SELECT id, clinic_id, name, phone, date_of_birth, notes, created_at FROM patients WHERE id = ?', [id]);
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

    // 1. Fetch patient details with tenant check
    let patientQuery = `
      SELECT id, clinic_id, name, phone, date_of_birth, created_at
      FROM patients
      WHERE id = ?
    `;
    const patientParams = [id];

    if (role !== 'super_admin') {
      patientQuery += ' AND clinic_id = ?';
      patientParams.push(clinicId);
    }

    const [patients] = await pool.query(patientQuery, patientParams);

    if (patients.length === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patients[0];

    // 2. Fetch joined appointment history for this patient
    const [appointments] = await pool.query(`
      SELECT 
        a.id AS appointment_id,
        a.scheduled_at,
        a.status,
        a.notes,
        d.id AS doctor_id,
        u.name AS doctor_name,
        at.name AS appointment_type
      FROM appointments a
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
      WHERE a.patient_id = ? AND a.clinic_id = ?
      ORDER BY a.scheduled_at DESC
    `, [id, patient.clinic_id]);

    // Return combined payload
    res.json({
      ...patient,
      total_appointments: appointments.length,
      appointment_history: appointments
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};