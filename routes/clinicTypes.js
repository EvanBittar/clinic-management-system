const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const clinicTypesController = require('../controllers/clinicTypesController');

router.use(authenticateToken);

router.post(
  '/',
  authorizeRoles('super_admin'),
  [body('name').trim().notEmpty().withMessage('Clinic type name is required')],
  clinicTypesController.create
);

router.get('/', clinicTypesController.getAll);

module.exports = router;
