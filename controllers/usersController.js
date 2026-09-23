const pool = require("../config/db");
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { name, role, username, password } = req.body;
    let clinic_id;
    
    if (req.user.role === 'super_admin') {
      clinic_id = req.body.clinic_id;
      if (role !== 'manager') {
        return res.status(400).json({ message: 'Super Admin can only create Manager accounts' });
      }
    } else if (req.user.role === 'manager') {
      clinic_id = req.user.clinicId;
      if (role !== 'doctor' && role !== 'assistant') {
        return res.status(400).json({ message: 'Managers can only create Doctor or Assistant accounts' });
      }
    }

    const hashPassword = await bcrypt.hash(password,10);
    
    const [result] = await pool.query("INSERT INTO users (clinic_id,name,role,username,password) VALUES (?,?,?,?,?)"
      , [clinic_id, name, role, username, hashPassword])

    res.status(201).json({ id: result.insertId, clinic_id, name, role, username});

  } catch (error) {

    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}