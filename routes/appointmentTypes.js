const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const appointmentTypesController = require('../controllers/appointmentTypesController');

router.use(authenticateToken);

router.post(
  '/',
  authorizeRoles('super_admin', 'manager', 'deputy_manager'),
  [body('name').trim().notEmpty().withMessage('Appointment type name is required')],
  appointmentTypesController.create
);

router.get('/', appointmentTypesController.getAll);

module.exports = router;