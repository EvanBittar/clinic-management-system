const express = require('express');
const router = express.Router();
const authorizeRoles = require('../middleware/authorize');
const authenticateToken = require('../middleware/auth');
const { param, body } = require('express-validator');
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

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('super_admin', 'manager', 'deputy_manager', 'reception', 'doctor'),
  [
    param('id').isInt().withMessage('Valid appointment ID required'),
    body('scheduled_at').optional().isISO8601().withMessage('Valid ISO8601 datetime required'),
    body('notes').optional().isString().trim(),
    body('doctor_id').optional().isInt().withMessage('Valid doctor_id required'),
    body('appointment_type_id').optional().isInt().withMessage('Valid appointment_type_id required')
  ],
  appointmentsController.update
);

router.get('/', authenticateToken, appointmentsController.getAll);

router.get('/:id', authenticateToken, appointmentsController.getById);
router.get('/summary/daily', authenticateToken, appointmentsController.getDailySummary);

module.exports = router;