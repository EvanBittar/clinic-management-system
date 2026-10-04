const pool = require("../config/db");
const { validationResult } = require('express-validator');
const { createNotification } = require('./notificationsController');

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
    if (Number(check1[0].clinic_id) !== Number(clinic_id)) {
      return res.status(403).json({ message: 'This patient does not belong to your clinic' });
    }

    // Check 2: doctor
    const [check2] = await pool.query('SELECT clinic_id FROM doctors WHERE id = ?', [doctor_id]);
    if (check2.length === 0) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    if (Number(check2[0].clinic_id) !== Number(clinic_id)) {
      return res.status(403).json({ message: 'This doctor does not belong to your clinic' });
    }

    // Check 3: appointment type
    const [check3] = await pool.query('SELECT clinic_id FROM appointment_types WHERE id = ?', [appointment_type_id]);
    if (check3.length === 0) {
      return res.status(404).json({ message: 'Appointment type not found' });
    }
    if (Number(check3[0].clinic_id) !== Number(clinic_id)) {
      return res.status(403).json({ message: 'This appointment type does not belong to your clinic' });
    }

    const [result] = await pool.query(
      'INSERT INTO appointments (clinic_id, patient_id, doctor_id, appointment_type_id, scheduled_at, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [clinic_id, patient_id, doctor_id, appointment_type_id, scheduled_at, notes || null, req.user.userId]
    );

    // Get the doctor's user_id and their assistant's user_id
    const [docInfo] = await pool.query('SELECT user_id, assistant_user_id FROM doctors WHERE id = ?', [doctor_id]);

    await createNotification(clinic_id, docInfo[0].user_id, result.insertId, 'new_appointment', `New appointment scheduled for ${scheduled_at}`);

    if (docInfo[0].assistant_user_id) {
      await createNotification(clinic_id, docInfo[0].assistant_user_id, result.insertId, 'new_appointment', `New appointment scheduled for ${scheduled_at}`);
    }

    res.status(201).json({
      id: result.insertId, clinic_id, patient_id, doctor_id, appointment_type_id,
      scheduled_at, notes: notes || null, status: 'new'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
exports.getAll = async (req, res) => {
  try {
    const clinic_id = req.user.clinicId;
    const { date, doctor_id, status } = req.query;

    let query = `
    SELECT appointments.id, 
        appointments.scheduled_at, 
        appointments.status, 
        appointments.notes,
        patients.name AS patient_name,
        users.name AS doctor_name,
        appointment_types.name AS appointment_type
      FROM appointments
      JOIN patients ON appointments.patient_id = patients.id
      JOIN doctors ON appointments.doctor_id = doctors.id
      JOIN users ON doctors.user_id = users.id
      LEFT JOIN appointment_types ON appointments.appointment_type_id = appointment_types.id
      WHERE appointments.clinic_id = ?
    `;
    const params = [clinic_id];

    if (date) {
      query += ' AND DATE(appointments.scheduled_at) = ?';
      params.push(date);
    }
    if (doctor_id) {
      query += ' AND appointments.doctor_id = ?';
      params.push(doctor_id);
    }
    if (status) {
      query += ' AND appointments.status = ?';
      params.push(status);
    }

    query += ' ORDER BY appointments.scheduled_at ASC';

    const [result] = await pool.query(query, params);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const clinic_id = req.user.clinicId;
    const { id } = req.params;
    const { status } = req.body;

    const [check] = await pool.query('SELECT clinic_id, status FROM appointments WHERE id = ?', [id]);
    if (check.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    if (Number(check[0].clinic_id) !== Number(clinic_id)) {
      return res.status(403).json({ message: 'This appointment does not belong to your clinic' });
    }

    const old_status = check[0].status;

    await pool.query('UPDATE appointments SET status = ? WHERE id = ?', [status, id]);

    await pool.query(
      'INSERT INTO appointment_status_log (appointment_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)',
      [id, old_status, status, req.user.userId]
    );

    res.status(200).json({ id, old_status, new_status: status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const clinic_id = req.user.clinicId;

    const [check] = await pool.query('SELECT clinic_id FROM appointments WHERE id = ?', [id]);
    if (check.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    if (Number(check[0].clinic_id) !== Number(clinic_id)) {
      return res.status(403).json({ message: 'This appointment does not belong to your clinic' });
    }

    const [result] = await pool.query(`
      SELECT 
      appointments.id, appointments.scheduled_at, appointments.status, appointments.notes,
       patients.name AS patient_name,
       users.name AS doctor_name,
       appointment_types.name AS appointment_type
      FROM appointments
      JOIN patients ON appointments.patient_id = patients.id
      JOIN doctors ON appointments.doctor_id = doctors.id
      JOIN users ON doctors.user_id = users.id
      JOIN appointment_types ON appointments.appointment_type_id = appointment_types.id
      WHERE appointments.id = ?`, [id]);


    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getDailySummary = async (req, res) => {
  try {
    const clinic_id = req.user.clinicId;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'A date is required, e.g. ?date=2026-10-01' });
    }

    const [totalRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM appointments WHERE clinic_id = ? AND DATE(scheduled_at) = ?',
      [clinic_id, date]
    );

    const [byStatus] = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM appointments
       WHERE clinic_id = ? AND DATE(scheduled_at) = ?
       GROUP BY status`,
      [clinic_id, date]
    );

    const [byDepartment] = await pool.query(
      `SELECT departments.name AS department, COUNT(*) AS count
       FROM appointments
       JOIN doctors ON appointments.doctor_id = doctors.id
       JOIN departments ON doctors.department_id = departments.id
       WHERE appointments.clinic_id = ? AND DATE(appointments.scheduled_at) = ?
       GROUP BY departments.name`,
      [clinic_id, date]
    );

    res.json({
      date,
      total: totalRows[0].total,
      byStatus,
      byDepartment
    });
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
    const { scheduled_at, notes, doctor_id, appointment_type_id } = req.body;
    const { role, clinicId } = req.user;

    // 1. Fetch appointment & verify multi-tenant access
    const [existing] = await pool.query('SELECT clinic_id FROM appointments WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const targetClinicId = existing[0].clinic_id;

    if (role !== 'super_admin' && Number(targetClinicId) !== Number(clinicId)) {
      return res.status(403).json({ message: 'Access denied: Appointment belongs to another clinic' });
    }

    // 2. Validate doctor_id if provided
    if (doctor_id) {
      const [doctorCheck] = await pool.query(
        'SELECT id FROM doctors WHERE id = ? AND clinic_id = ?',
        [doctor_id, targetClinicId]
      );
      if (doctorCheck.length === 0) {
        return res.status(400).json({ message: 'Doctor not found or does not belong to this clinic' });
      }
    }

    // 3. Build dynamic SQL update query
    const updateFields = [];
    const queryParams = [];

    if (scheduled_at !== undefined) {
      updateFields.push('scheduled_at = ?');
      queryParams.push(scheduled_at);
    }
    if (notes !== undefined) {
      updateFields.push('notes = ?');
      queryParams.push(notes);
    }
    if (doctor_id !== undefined) {
      updateFields.push('doctor_id = ?');
      queryParams.push(doctor_id);
    }
    if (appointment_type_id !== undefined) {
      updateFields.push('appointment_type_id = ?');
      queryParams.push(appointment_type_id);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields provided for update' });
    }

    queryParams.push(id);

    const sql = `UPDATE appointments SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(sql, queryParams);

    // 4. Return updated appointment
    const [updated] = await pool.query(`
      SELECT 
        a.id, a.clinic_id, a.patient_id, a.doctor_id, a.appointment_type_id,
        a.scheduled_at, a.status, a.notes, a.created_at,
        p.name AS patient_name,
        u.name AS doctor_name,
        at.name AS appointment_type
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
      WHERE a.id = ?
    `, [id]);

    res.json({
      message: 'Appointment updated successfully',
      appointment: updated[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};