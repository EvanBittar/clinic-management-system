const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const patientsController = require('../controllers/patientsController');
const { body } = require('express-validator');

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

module.exports = router;