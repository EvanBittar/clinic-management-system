const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const clinicsController = require('../controllers/clinicsController');
const { body } = require('express-validator');

router.post('/'
    , authenticateToken,
    authorizeRoles('super_admin'), [
    body('name').trim().notEmpty().withMessage('Clinic name is required'),
    body('clinic_type_id').isInt().withMessage('A valid clinic_type_id is required')
],
    clinicsController.create
);

router.patch('/:id/status',
    authenticateToken,
    authorizeRoles('super_admin'), [
    body('is_active').isBoolean().withMessage('is_active must be a boolean')
],
    clinicsController.toggleActive
);

router.get('/',
    authenticateToken,
    authorizeRoles('super_admin'),
    clinicsController.getAll
);

router.get(
    '/:id',
    authenticateToken, 
    clinicsController.getById
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('super_admin','manager'),
  [
    body('name').notEmpty().trim().withMessage('Clinic name is required'),
    body('clinic_type_id').optional({ nullable: true }).isInt().withMessage('Valid clinic_type_id required')
  ],
  clinicsController.update
);

module.exports = router;