const pool = require("../config/db");
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, role, username, password } = req.body;
    let clinic_id;

    if (req.user.role === 'super_admin') {
      // Super Admin can only create Managers, for any clinic
      clinic_id = req.body.clinic_id;
      if (role !== 'manager') {
        return res.status(400).json({ message: 'Super Admin can only create Manager accounts' });
      }
    } else if (req.user.role === 'manager') {
      // Manager can create anyone below them, within their own clinic
      clinic_id = req.user.clinicId;
      if (!['deputy_manager', 'doctor', 'assistant', 'reception'].includes(role)) {
        return res.status(400).json({ message: 'Managers can only create Deputy Manager, Doctor, Assistant, or Reception accounts' });
      }
    } else if (req.user.role === 'deputy_manager') {
      // Deputy can create staff, but NOT another deputy
      clinic_id = req.user.clinicId;
      if (!['doctor', 'assistant', 'reception'].includes(role)) {
        return res.status(400).json({ message: 'Deputy Managers can only create Doctor, Assistant, or Reception accounts' });
      }
    } else {
      return res.status(403).json({ message: 'You are not allowed to create users' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (clinic_id, name, role, username, password) VALUES (?, ?, ?, ?, ?)',
      [clinic_id, name, role, username, hashedPassword]
    );

    res.status(201).json({ id: result.insertId, clinic_id, name, role, username });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That username is already taken' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.update = async (req, res) => {
  try {
    // 1. Validate errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, username, role, is_active, password } = req.body;

    // 2. Fetch the target user (id from req.params) — check exists, get their clinic_id + role
    const [targetUsers] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (targetUsers.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const targetUser = targetUsers[0];

    // 3. Permission check based on req.user.role
    if (req.user.role === 'super_admin') {
      // Super Admin manages Managers across any clinic
      if (targetUser.role !== 'manager' && req.user.userId !== targetUser.id) {
        return res.status(403).json({ message: 'Super Admin can only modify Manager accounts' });
      }
      if (role && role !== 'manager') {
        return res.status(400).json({ message: 'Super Admin can only assign Manager role' });
      }
    } else if (req.user.role === 'manager') {
      // Must belong to Manager's clinic
      if (String(targetUser.clinic_id) !== String(req.user.clinicId)) {
        return res.status(403).json({ message: 'This user does not belong to your clinic' });
      }
      // Manager cannot modify another Manager or Super Admin (unless editing self)
      if (['super_admin', 'manager'].includes(targetUser.role) && req.user.userId !== targetUser.id) {
        return res.status(403).json({ message: 'Managers cannot modify other Manager or Super Admin accounts' });
      }
      // Manager cannot promote anyone to manager or super_admin
      if (role && !['deputy_manager', 'doctor', 'assistant', 'reception'].includes(role)) {
        return res.status(400).json({ message: 'Managers can only assign Deputy Manager, Doctor, Assistant, or Reception roles' });
      }
    } else if (req.user.role === 'deputy_manager') {
      // Must belong to Deputy Manager's clinic
      if (String(targetUser.clinic_id) !== String(req.user.clinicId)) {
        return res.status(403).json({ message: 'This user does not belong to your clinic' });
      }
      // Deputy can only manage staff below them
      if (['super_admin', 'manager', 'deputy_manager'].includes(targetUser.role) && req.user.userId !== targetUser.id) {
        return res.status(403).json({ message: 'Deputy Managers can only edit staff accounts' });
      }
      if (role && !['doctor', 'assistant', 'reception'].includes(role)) {
        return res.status(400).json({ message: 'Deputy Managers can only assign Doctor, Assistant, or Reception roles' });
      }
    } else {
      // Regular staff updating themselves
      if (req.user.userId !== targetUser.id) {
        return res.status(403).json({ message: 'You are not allowed to update other users' });
      }
      if (role || is_active !== undefined) {
        return res.status(403).json({ message: 'You cannot change your own role or active status' });
      }
    }

    // 4. Build the dynamic SET clause from whatever fields were sent
    const fields = [];
    const values = [];

    if (name) {
      fields.push('name = ?');
      values.push(name);
    }
    if (username) {
      fields.push('username = ?');
      values.push(username);
    }
    if (role) {
      fields.push('role = ?');
      values.push(role);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(is_active);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hashedPassword);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields provided to update' });
    }

    // 5. Run the UPDATE
    values.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    // 6. Respond with updated user record
    const [updatedUsers] = await pool.query(
      'SELECT id, clinic_id, name, role, username, is_active, created_at FROM users WHERE id = ?',
      [id]
    );

    res.json(updatedUsers[0]);

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That username is already taken' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};