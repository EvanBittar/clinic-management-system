const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const usersController = require('../controllers/usersController');
const { body } = require('express-validator');

router.post('/',
  authenticateToken,
  authorizeRoles('super_admin', 'manager', 'deputy_manager'),
  [
    body('clinic_id').optional({ checkFalsy: true }).isInt().withMessage('A valid clinic_id is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('role').trim().notEmpty().withMessage('Select role for user'),
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  usersController.create
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('super_admin', 'manager', 'deputy_manager', 'doctor', 'assistant', 'reception'), [
  body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty'),
  body('username').optional().isString().trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').optional().isString().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['manager', 'deputy_manager', 'doctor', 'assistant', 'reception']).withMessage('Invalid role provided'),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean')

],
  usersController.update,
);

module.exports = router;