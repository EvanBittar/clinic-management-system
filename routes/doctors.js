const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const doctorsController = require('../controllers/doctorsController');
const { query, body } = require('express-validator');

router.post('/',
    authenticateToken,
    authorizeRoles('manager'),
    [
        body('clinic_id').isInt().withMessage('A valid clinic_id is required'),
        body('user_id').isInt().withMessage('A valid user_id is required'),
        body('department_id').isInt().withMessage('A valid department_id is required'),
        body('assistant_user_id').default().optional({ checkFalsy: true }).isInt().withMessage('A valid assistant_user_id is required')
    ],
    doctorsController.create
);

router.get('/', authenticateToken, doctorsController.getAll);

router.put(
    '/:id',
    authenticateToken,
    authorizeRoles('manager', 'deputy_manager', 'doctor'),
    [
        body('department_id').optional({ nullable: true }).isInt().withMessage('department_id must be an integer or null'),
        body('assistant_user_id').optional({ nullable: true }).isInt().withMessage('assistant_user_id must be an integer or null')
    ],
    doctorsController.update
);

router.get(
    '/schedule',
    authenticateToken,
    authorizeRoles('super_admin', 'manager', 'deputy_manager', 'doctor', 'assistant'), [
    query('date').optional().isISO8601().withMessage('Valid date required (YYYY-MM-DD)'),
    query('doctor_id').optional().isInt().withMessage('Valid doctor_id required')
],
    doctorsController.getSchedule
);

router.get(
    '/:id',
    authenticateToken,
    authorizeRoles('super_admin', 'manager', 'deputy_manager', 'reception', 'doctor'),
    doctorsController.getById
);

module.exports = router;