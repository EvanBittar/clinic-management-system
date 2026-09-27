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
      return res.status(403).json({ message: 'You are not allowed to create appointments' });
    }

    const clinic_id = req.user.clinicId;
    const { patient_id, doctor_id, appointment_type_id, scheduled_at, notes } = req.body;

    // Check 1: patient
    const [check1] = await pool.query('SELECT clinic_id FROM patients WHERE id = ?', [patient_id]);
    if (check1.length === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    if (check1[0].clinic_id !== clinic_id) {
      return res.status(403).json({ message: 'This patient does not belong to your clinic' });
    }

    // Check 2: doctor
    const [check2] = await pool.query('SELECT clinic_id FROM doctors WHERE id = ?', [doctor_id]);
    if (check2.length === 0) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    if (check2[0].clinic_id !== clinic_id) {
      return res.status(403).json({ message: 'This doctor does not belong to your clinic' });
    }

    // Check 3: appointment type
    const [check3] = await pool.query('SELECT clinic_id FROM appointment_types WHERE id = ?', [appointment_type_id]);
    if (check3.length === 0) {
      return res.status(404).json({ message: 'Appointment type not found' });
    }
    if (check3[0].clinic_id !== clinic_id) {
      return res.status(403).json({ message: 'This appointment type does not belong to your clinic' });
    }

    const [result] = await pool.query(
      'INSERT INTO appointments (clinic_id, patient_id, doctor_id, appointment_type_id, scheduled_at, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [clinic_id, patient_id, doctor_id, appointment_type_id, scheduled_at, notes || null, req.user.userId]
    );

    res.status(201).json({
      id: result.insertId, clinic_id, patient_id, doctor_id, appointment_type_id,
      scheduled_at, notes: notes || null, status: 'new'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};