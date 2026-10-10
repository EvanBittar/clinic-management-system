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

exports.toggleStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { is_active } = req.body;

    // 1. Fetch Target User
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const targetUser = users[0];

    // 2. Tenant Isolation Check
    if (String(targetUser.clinic_id) !== String(req.user.clinicId)) {
      return res.status(403).json({ message: 'This user does not belong to your clinic' });
    }

    // 3. Self-Deactivation Guard
    if (String(targetUser.id) === String(req.user.userId)) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    // 4. Role Hierarchy Check
    // Hierarchy: manager > deputy_manager > (doctor, reception, assistant, etc.)
    const actorRole = req.user.role;
    const targetRole = targetUser.role;

    if (actorRole === 'manager') {
      // Manager cannot modify another manager or super_admin
      if (['manager', 'super_admin'].includes(targetRole)) {
        return res.status(403).json({ message: 'Managers cannot modify status of other managers' });
      }
    } else if (actorRole === 'deputy_manager') {
      // Deputy Manager can only manage operational staff (cannot modify managers or deputy_managers)
      if (['manager', 'deputy_manager', 'super_admin'].includes(targetRole)) {
        return res.status(403).json({ message: 'Deputy managers cannot modify status of managers or deputy managers' });
      }
    } else {
      // Operational staff cannot toggle user status
      return res.status(403).json({ message: 'You are not authorized to update user status' });
    }

    // 5. Update Status
    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, id]);

    // 6. Return Updated User State
    const [updated] = await pool.query(
      'SELECT id, clinic_id, name, username, role, is_active FROM users WHERE id = ?',
      [id]
    );

    res.json({
      message: `User status updated to ${is_active ? 'active' : 'inactive'}`,
      user: updated[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { role, clinicId } = req.user;

    let query = `
      SELECT u.id, u.clinic_id, u.name, u.username, u.role, u.is_active, u.created_at, c.name AS clinic_name
      FROM users u
      LEFT JOIN clinics c ON u.clinic_id = c.id
    `;
    const params = [];

    if (role !== 'super_admin') {
      query += ' WHERE u.clinic_id = ?';
      params.push(clinicId);
    }

    query += ' ORDER BY u.created_at DESC';

    const [users] = await pool.query(query, params);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, clinicId } = req.user;

    const [users] = await pool.query(`
      SELECT u.id, u.clinic_id, u.name, u.username, u.role, u.is_active, u.created_at, c.name AS clinic_name
      FROM users u
      LEFT JOIN clinics c ON u.clinic_id = c.id
      WHERE u.id = ?
    `, [id]);

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const targetUser = users[0];

    // Multi-tenant isolation check using targetUser.clinic_id and req.user.clinicId
    if (role !== 'super_admin' && Number(targetUser.clinic_id) !== Number(clinicId)) {
      return res.status(403).json({ message: 'Access denied: Cannot view staff outside your clinic' });
    }

    res.json(targetUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getLoginLogs = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { role, clinicId } = req.user;
    const { date, view } = req.query;

    const conditions = [];
    const params = [];

    // Tenant isolation
    if (role !== 'super_admin') {
      conditions.push('l.clinic_id = ?');
      params.push(clinicId);
    }

    // Date filter: MySQL decides what "today" is, so no UTC shift
    if (date) {
      conditions.push('DATE(l.logged_in_at) = ?');
      params.push(date);
    } else {
      conditions.push('DATE(l.logged_in_at) = CURDATE()');
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    let sql;
    if (view === 'summary') {
      // One row per person: who was here, when they first/last logged in
      sql = `
        SELECT u.id AS user_id, u.name AS user_name, u.username, u.role,
               MIN(l.logged_in_at) AS first_login,
               MAX(l.logged_in_at) AS last_login,
               COUNT(*) AS login_count
        FROM login_logs l
        JOIN users u ON l.user_id = u.id
        ${where}
        GROUP BY u.id, u.name, u.username, u.role
        ORDER BY first_login ASC
      `;
    } else {
      // Every individual login
      sql = `
        SELECT l.id, l.user_id, u.name AS user_name, u.username, u.role, l.clinic_id, l.logged_in_at
        FROM login_logs l
        JOIN users u ON l.user_id = u.id
        ${where}
        ORDER BY l.logged_in_at DESC
      `;
    }

    const [rows] = await pool.query(sql, params);

    res.json({
      date: date || 'today',
      view: view === 'summary' ? 'summary' : 'detailed',
      count: rows.length,
      logs: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};