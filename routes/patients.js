const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const patientsController = require('../controllers/patientsController');
const { param,body } = require('express-validator');

router.post('/',
  authenticateToken,
  authorizeRoles('manager', 'deputy_manager', 'reception'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').optional({ checkFalsy: true }).isString().trim(),
    body('date_of_birth').optional({ checkFalsy: true }).isDate().withMessage('Must be a valid date'),
    body('notes').optional({ checkFalsy: true }).isString()
  ],
  patientsController.create
);

router.get('/', authenticateToken, patientsController.getAll);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('manager', 'deputy_manager', 'reception'),
  [
    body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional({ values: 'falsy' }).trim().matches(/^\+?[0-9\s\-()]{7,20}$/).withMessage('Invalid phone number format'),,
    body('date_of_birth').optional({ nullable: true }).isISO8601().withMessage('date_of_birth must be a valid YYYY-MM-DD date'),
    body('notes').optional({ nullable: true }).isString()
  ],
  patientsController.update
);

router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('super_admin', 'manager', 'deputy_manager', 'reception', 'doctor'),
  [param('id').isInt().withMessage('Valid patient ID required')],
  patientsController.getById
);

module.exports = router;