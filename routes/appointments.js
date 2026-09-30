const express = require('express');
const router = express.Router();
const authorizeRoles = require('../middleware/authorize');
const authenticateToken = require('../middleware/auth');
const { body } = require('express-validator');
const appointmentsController = require('../controllers/appointmentsController');

router.post('/',
  authenticateToken,
  authorizeRoles('manager', 'deputy_manager', 'reception'),
  [
    body('patient_id').isInt().withMessage('A valid patient_id is required'),
    body('doctor_id').isInt().withMessage('A valid doctor_id is required'),
    body('appointment_type_id').isInt().withMessage('A valid appointment_type_id is required'),
    body('scheduled_at').notEmpty().isISO8601().withMessage('A valid scheduled_at date/time is required'),
    body('notes').optional({ checkFalsy: true }).isString()
  ],
  appointmentsController.create
);

router.patch('/:id/status',
  authenticateToken,
  [body('status').isIn(['new', 'confirmed', 'arrived', 'in_consultation', 'completed', 'cancelled', 'postponed', 'no_show', 'needs_follow_up']).withMessage('Invalid status value')],
  appointmentsController.updateStatus
);

router.get('/', authenticateToken, appointmentsController.getAll);

module.exports = router;