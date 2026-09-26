// routes/appointmentTypes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authenticateToken = require('../middleware/auth');
const appointmentTypesController = require('../controllers/appointmentTypesController');

router.post('/',
  authenticateToken,
  [body('name').trim().notEmpty().withMessage('Appointment type name is required')],
  appointmentTypesController.create
);

router.get('/', authenticateToken, appointmentTypesController.getAll);

module.exports = router;